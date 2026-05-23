// Contact form. Extracted from landing.ts.
//
// Owns the /contact form DOM, lane-shape (anon vs signed-in), honeypot,
// submit/error states, and the applyAuth reconciliation hook called once
// /api/auth/me resolves.

// Minimal subset of AuthUser — kept in sync with landing.ts. Promote to a
// shared types module if a third caller appears.
type AuthUser = {
  email: string;
  handle: string;
};

export interface ContactView {
  el: HTMLElement;
  applyAuth: (user: AuthUser | null) => void;
}

export function buildContact(initialUser: AuthUser | null, initialSignedInHint: boolean): ContactView {
  // Three initial states: confirmed user (cached object → render real banner),
  // hinted signed-in (boolean only → render placeholder banner), or anon.
  const initialSignedIn = initialUser !== null || initialSignedInHint;

  const section = document.createElement('section');
  section.className = 'site-section contact-section';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Contact';

  const introAnon = 'Bug, idea, broken game, anything else. Add an email if you want a reply.';
  const introUser = 'Bug, idea, broken game, anything else.';

  const intro = document.createElement('p');
  intro.className = 'contact-intro';
  intro.textContent = initialSignedIn ? introUser : introAnon;

  const replyNote = document.createElement('p');
  replyNote.className = 'contact-reply-note';
  replyNote.textContent = 'Usually a reply within a day or two.';

  const form = document.createElement('form');
  form.className = 'contact-form';
  form.noValidate = true;

  const messageLabel = document.createElement('label');
  messageLabel.className = 'contact-field';
  const messageLabelText = document.createElement('span');
  messageLabelText.textContent = 'Message';
  const messageInput = document.createElement('textarea');
  messageInput.name = 'message';
  messageInput.required = true;
  messageInput.rows = 6;
  messageInput.maxLength = 5000;
  messageInput.placeholder = "What's on your mind?";
  messageLabel.append(messageLabelText, messageInput);

  // Lane slot: rendered in user-lane shape if we have a synchronous hint that
  // the visitor is signed in (localStorage), otherwise anon. Reconciled with
  // the real auth fetch via applyAuth below.
  const laneSlot = document.createElement('div');
  laneSlot.className = 'contact-lane-slot';

  // Anon-lane elements (kept around to swap back into if needed).
  const emailLabel = document.createElement('label');
  emailLabel.className = 'contact-field';
  const emailLabelText = document.createElement('span');
  emailLabelText.textContent = 'Email (optional)';
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.name = 'email';
  emailInput.autocomplete = 'email';
  emailInput.placeholder = 'you@example.com';
  emailLabel.append(emailLabelText, emailInput);

  const signinPrompt = document.createElement('p');
  signinPrompt.className = 'contact-signin-prompt';
  const signinLink = document.createElement('a');
  signinLink.href = '/account';
  signinLink.textContent = 'Sign in';
  signinPrompt.append(signinLink, document.createTextNode(' for a faster reply.'));

  const buildAnonSlot = (): void => {
    laneSlot.dataset.lane = 'anon';
    laneSlot.replaceChildren(emailLabel, signinPrompt);
  };

  const buildUserSlot = (user: AuthUser | null): void => {
    laneSlot.dataset.lane = 'user';
    const hint = document.createElement('p');
    hint.className = 'contact-signed-in-hint';
    if (user) {
      hint.append(
        document.createTextNode('Signed in as '),
        Object.assign(document.createElement('strong'), { textContent: `@${user.handle}` }),
      );
      if (user.email) {
        hint.append(document.createTextNode(` — we'll reply to ${user.email}.`));
      } else {
        hint.append(document.createTextNode('.'));
      }
    } else {
      // Placeholder used when we only have the localStorage hint and haven't
      // yet resolved the authoritative user.
      hint.textContent = "Signed in — we'll reply to your account email.";
    }
    laneSlot.replaceChildren(hint);
  };

  // Initial paint. If we have the full user object, render the real banner
  // immediately (no placeholder→real swap when /api/auth/me resolves).
  if (initialUser) buildUserSlot(initialUser);
  else if (initialSignedInHint) buildUserSlot(null);
  else buildAnonSlot();

  // Honeypot: hidden from humans, attractive to bots. Server discards if filled.
  const honeypotLabel = document.createElement('label');
  honeypotLabel.setAttribute('aria-hidden', 'true');
  honeypotLabel.style.position = 'absolute';
  honeypotLabel.style.left = '-9999px';
  honeypotLabel.style.opacity = '0';
  honeypotLabel.style.pointerEvents = 'none';
  honeypotLabel.tabIndex = -1;
  const honeypotInput = document.createElement('input');
  honeypotInput.type = 'text';
  honeypotInput.name = 'website';
  honeypotInput.autocomplete = 'off';
  honeypotInput.tabIndex = -1;
  honeypotLabel.append('Website', honeypotInput);

  const submitRow = document.createElement('div');
  submitRow.className = 'contact-submit-row';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'contact-submit';
  submit.textContent = 'Send';
  const status = document.createElement('span');
  status.className = 'contact-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  submitRow.append(submit, status);

  form.append(messageLabel, laneSlot, honeypotLabel, submitRow);

  // Closure flag: when true, omit the email from the submitted payload
  // (server ignores it anyway, but no point sending it).
  let signedIn = initialSignedIn;

  const applyAuth = (user: AuthUser | null): void => {
    if (user) {
      signedIn = true;
      buildUserSlot(user);
      intro.textContent = introUser;
    } else {
      // Authoritative: not signed in. Either confirms the anon default or
      // reverts a stale signed-in hint (sign-out from another tab, etc.).
      signedIn = false;
      buildAnonSlot();
      intro.textContent = introAnon;
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const message = messageInput.value.trim();
    if (message.length === 0) {
      status.textContent = 'Please enter a message.';
      status.dataset.state = 'error';
      messageInput.focus();
      return;
    }
    submit.disabled = true;
    status.textContent = 'Sending…';
    status.dataset.state = 'pending';

    void (async () => {
      try {
        const response = await fetch('/api/feedback', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message,
            email: signedIn ? null : (emailInput.value.trim() || null),
            path: window.location.pathname,
            website: honeypotInput.value,
          }),
        });
        if (response.ok) {
          messageInput.value = '';
          if (!signedIn) emailInput.value = '';
          status.textContent = 'Thanks — message received.';
          status.dataset.state = 'ok';
        } else if (response.status === 429) {
          status.textContent = signedIn
            ? 'Too many submissions. Try again in a bit.'
            : "Daily limit reached — sign in for unlimited replies, or try again tomorrow.";
          status.dataset.state = 'error';
        } else {
          status.textContent = "Couldn't send. Try again, or email if it keeps failing.";
          status.dataset.state = 'error';
        }
      } catch {
        status.textContent = 'Network error. Try again.';
        status.dataset.state = 'error';
      } finally {
        submit.disabled = false;
      }
    })();
  });

  const card = document.createElement('div');
  card.className = 'contact-card';
  card.append(form);

  section.append(heading, intro, replyNote, card);
  return { el: section, applyAuth };
}
