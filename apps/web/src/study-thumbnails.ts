import './study-thumbnails.css';

type StudyThumbnail = {
  src: string;
  sourceLabel: string;
};

const FLAGSHIP_STUDY_THUMBNAILS: Readonly<Record<string, StudyThumbnail>> = {
  Dfi3NpRE: {
    src: '/study-thumbnails/tangerine-vol-1.webp',
    sourceLabel: 'Cover from the National Archives of Japan scan',
  },
  XBQuhA9n: {
    src: '/study-thumbnails/tangerine-vol-2.webp',
    sourceLabel: 'Cover from the National Archives of Japan scan',
  },
  EarRoCib: {
    src: '/study-thumbnails/tangerine-vol-3.webp',
    sourceLabel: 'Cover from the National Archives of Japan scan',
  },
  uXnuObfx: {
    src: '/study-thumbnails/seven-stars.webp',
    sourceLabel: 'Cover from the 1916 Internet Archive scan',
  },
  rhrGqFnM: {
    src: '/study-thumbnails/golden-roc.webp',
    sourceLabel: 'Title leaf from the Bavarian State Library scan',
  },
};

export function buildStudyThumbnail(
  studyId: string,
  className: string,
  loading: 'eager' | 'lazy' = 'lazy',
): HTMLElement | null {
  const thumbnail = FLAGSHIP_STUDY_THUMBNAILS[studyId];
  if (!thumbnail) return null;

  const frame = document.createElement('span');
  frame.className = `study-thumbnail ${className}`;
  frame.title = thumbnail.sourceLabel;
  frame.setAttribute('aria-hidden', 'true');

  const image = document.createElement('img');
  image.src = thumbnail.src;
  image.alt = '';
  image.loading = loading;
  image.decoding = 'async';
  frame.append(image);
  return frame;
}
