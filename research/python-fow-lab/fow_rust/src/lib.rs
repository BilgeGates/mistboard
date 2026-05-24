//! Native Rust hot-path for Fog of War chess belief-state enumeration.
//!
//! Scope (Phase A perf): `visible_squares` + `consistent_with` +
//! the `update_opp_move` inner loop. Everything else stays in Python.
//!
//! Built on shakmaty for FoW-tolerant FEN parsing (kings can walk into
//! attack in FoW; other chess libraries reject those positions) and its
//! attack-bitboard primitives.

use core::num::NonZeroU32;

use pyo3::prelude::*;
use shakmaty::{
    attacks, fen::Fen, Bitboard, Board as ShakBoard, Color, File, Piece, Rank, Role, Setup, Square,
};

/// Hello-world ping; verifies the wheel is loaded.
#[pyfunction]
fn ping() -> &'static str {
    "fow_rust 0.1.0 alive"
}

/// FEN parse-then-serialize. Used as a parity check against python-chess
/// to validate that shakmaty's `Fen` serializer produces byte-identical
/// output to `chess.Board.fen()`. Required for set-based dedup to work
/// across the Python/Rust boundary.
#[pyfunction]
fn fen_roundtrip(fen: &str) -> PyResult<String> {
    let parsed = Fen::from_ascii(fen.as_bytes()).map_err(|e| {
        pyo3::exceptions::PyValueError::new_err(format!("bad FEN: {e}"))
    })?;
    let setup = parsed.into_setup();
    Ok(Fen(setup).to_string())
}

/// Bitmask of squares visible to `color_bool` (true=white, false=black)
/// under FoW. Returns u64. Matches Python `fow_chess.visibility.visible_squares`.
///
/// FEN-input variant — convenient for tests, slower for hot path because
/// Python has to serialize board → FEN. Use `visible_squares_bb` for the
/// hot path.
#[pyfunction]
fn visible_squares(fen: &str, color_bool: bool) -> PyResult<u64> {
    let setup = parse_fen_lenient(fen)?;
    let color = if color_bool { Color::White } else { Color::Black };
    Ok(visible_squares_from_setup(&setup, color))
}

/// Bitboard-input variant for hot-path callers. Skips FEN serialization.
///
/// Inputs are exactly the bitboards python-chess exposes on `chess.Board`:
///   - pawns, knights, bishops, rooks, queens, kings — bitboard per piece type
///   - occupied_white, occupied_black — bitboard per color
///   - castling_rights — bitboard of rook origins with castling rights
///   - ep_square_idx — 0..63 if ep set, or 64 if no ep (avoids Option in PyO3)
///   - color_bool — true = white, false = black
#[pyfunction]
#[allow(clippy::too_many_arguments)]
fn visible_squares_bb(
    pawns: u64,
    knights: u64,
    bishops: u64,
    rooks: u64,
    queens: u64,
    kings: u64,
    occupied_white: u64,
    occupied_black: u64,
    castling_rights: u64,
    ep_square_idx: u32,
    color_bool: bool,
) -> u64 {
    let setup = setup_from_bb(
        pawns, knights, bishops, rooks, queens, kings,
        occupied_white, occupied_black, castling_rights, ep_square_idx,
    );
    let color = if color_bool { Color::White } else { Color::Black };
    visible_squares_from_setup(&setup, color)
}

/// Apply a pseudo-legal move and return the resulting FEN.
///
/// Mirror semantics of `chess.Board.push(move)` for FoW-tolerant positions
/// (kings may be captured, may walk into check). The caller passes the
/// move as `(from_sq, to_sq, promotion)` where `promotion` is 0 for none or
/// shakmaty's Role number (2=Knight, 3=Bishop, 4=Rook, 5=Queen).
///
/// Special-move detection (castling vs normal king move, en passant vs
/// pawn capture) is recovered from board context, mirroring python-chess.
#[pyfunction]
fn apply_move(fen: &str, from_idx: u8, to_idx: u8, promo: u8) -> PyResult<String> {
    let setup = parse_fen_lenient(fen)?;
    let from = unsafe { Square::new_unchecked(from_idx as u32) };
    let to = unsafe { Square::new_unchecked(to_idx as u32) };
    let promo_role = role_from_int(promo);
    let new_setup = apply_move_to_setup(&setup, from, to, promo_role);
    Ok(Fen(new_setup).to_string())
}

#[inline]
fn role_from_int(n: u8) -> Option<Role> {
    match n {
        0 => None,
        2 => Some(Role::Knight),
        3 => Some(Role::Bishop),
        4 => Some(Role::Rook),
        5 => Some(Role::Queen),
        _ => None, // invalid promotion ints are treated as no-promo for defensiveness
    }
}

fn apply_move_to_setup(setup: &Setup, from: Square, to: Square, promo: Option<Role>) -> Setup {
    let stm = setup.turn;
    let board = &setup.board;
    let moving_role = board
        .role_at(from)
        .expect("apply_move called with empty from-square");
    let captured_role = board.role_at(to);

    let is_castling = moving_role == Role::King
        && (from.file() as i32 - to.file() as i32).abs() == 2;
    let is_ep = moving_role == Role::Pawn
        && captured_role.is_none()
        && setup.ep_square == Some(to);

    let mut next = setup.clone();
    let nb = &mut next.board;

    if is_castling {
        let kingside = (to.file() as u8) > (from.file() as u8);
        // Find the matching rook with castling rights on this side
        let rook_from = setup
            .castling_rights
            .into_iter()
            .find(|r| {
                board.color_at(*r) == Some(stm)
                    && r.rank() == from.rank()
                    && ((r.file() as u8) > (from.file() as u8)) == kingside
            })
            .expect("castling without matching rook in castling_rights");
        let rook_to_file = if kingside { File::F } else { File::D };
        let rook_to = Square::from_coords(rook_to_file, from.rank());

        nb.discard_piece_at(from);
        nb.discard_piece_at(rook_from);
        nb.set_piece_at(to, Piece { color: stm, role: Role::King });
        nb.set_piece_at(rook_to, Piece { color: stm, role: Role::Rook });
    } else if is_ep {
        let captured_sq = Square::from_coords(to.file(), from.rank());
        nb.discard_piece_at(from);
        nb.discard_piece_at(captured_sq);
        nb.set_piece_at(to, Piece { color: stm, role: Role::Pawn });
    } else {
        nb.discard_piece_at(from);
        // set_piece_at internally discards target square, so no explicit capture-clear needed
        let placed_role = promo.unwrap_or(moving_role);
        nb.set_piece_at(to, Piece { color: stm, role: placed_role });
    }

    // En passant square: emit only when at least one ep capture is LEGAL
    // (capturer's king not left in check). Mirrors python-chess's default
    // `EnPassantMode.LEGAL` behavior in `fen()` — required for FEN-equality
    // dedup of next-positions.
    next.ep_square = if moving_role == Role::Pawn
        && (from.rank() as i32 - to.rank() as i32).abs() == 2
    {
        let mid_rank = Rank::new(((from.rank() as u32) + (to.rank() as u32)) / 2);
        let ep_cand = Square::from_coords(from.file(), mid_rank);
        let enemy_color = stm.other();
        // Use the post-push board (`nb`) so the just-pushed pawn at `to` is
        // present (and gets removed in the ep simulation).
        if has_legal_ep_capture(nb, enemy_color, ep_cand, to) {
            Some(ep_cand)
        } else {
            None
        }
    } else {
        None
    };

    // Halfmove clock: reset on pawn move or capture; else +1
    let was_capture = captured_role.is_some() || is_ep;
    next.halfmoves = if moving_role == Role::Pawn || was_capture {
        0
    } else {
        setup.halfmoves + 1
    };

    // Castling rights update
    next.castling_rights = update_castling_rights(setup.castling_rights, from, to, moving_role, stm);

    // FoW: when a king is captured, the captured color loses ALL castling
    // rights (they can't castle without a king). Mirrors python-chess.
    if captured_role == Some(Role::King) {
        let captured_color = stm.other();
        let backrank = match captured_color {
            Color::White => Rank::First,
            Color::Black => Rank::Eighth,
        };
        next.castling_rights = next.castling_rights & !Bitboard::from(backrank);
    }

    // Turn toggle + fullmove increment after black moves
    next.turn = stm.other();
    if stm == Color::Black {
        next.fullmoves = NonZeroU32::new(setup.fullmoves.get() + 1)
            .expect("fullmoves+1 is never zero");
    }

    next
}

/// Does at least one en-passant capture exist for `capturer` that doesn't
/// leave the capturer's king in check? Used to mirror python-chess's
/// FEN `EnPassantMode.LEGAL` filter — emit ep_square only if a legal ep
/// capture exists from this position.
fn has_legal_ep_capture(
    board: &ShakBoard,
    capturer: Color,
    ep_target: Square,
    captured_pawn_sq: Square,
) -> bool {
    let pawn_rank = captured_pawn_sq.rank();
    let capturer_pawns = board.by_piece(capturer.pawn());
    for adj in adjacent_files(ep_target.file()) {
        let pawn_sq = Square::from_coords(adj, pawn_rank);
        if !capturer_pawns.contains(pawn_sq) {
            continue;
        }
        // Simulate ep: capturer pawn moves pawn_sq → ep_target, captured pawn removed.
        // python-chess returns False if capturer has no king (can't be in check).
        let king_bb = board.by_piece(capturer.king());
        if king_bb.count() != 1 {
            continue;
        }
        let king_sq = king_bb.first().unwrap();

        // Build the post-ep occupancy from the input board (post-push state):
        // remove capturer pawn (pawn_sq) AND captured pawn (captured_pawn_sq);
        // add the capturer pawn at ep_target.
        let removed = Bitboard::from_square(pawn_sq) | Bitboard::from_square(captured_pawn_sq);
        let added = Bitboard::from_square(ep_target);
        let post_occ = (board.occupied() & !removed) | added;

        // For the attacker scan we also need to exclude the captured enemy
        // pawn from the enemy-pawn bitboard (it can no longer attack), and
        // exclude the moved capturer pawn from the friendly-pawn bitboard
        // (irrelevant for enemy attacks on our king, but mirrored for safety).
        let enemy = capturer.other();
        if !square_attacked_with_occ(board, king_sq, enemy, post_occ, captured_pawn_sq) {
            return true;
        }
    }
    false
}

/// Like `is_square_attacked`, but uses an explicit occupancy bitmask and
/// also excludes the source-square pawn from being an attacker (since it
/// just moved away). Pawn attacks are computed from board-recorded pawn
/// positions minus the moved pawn.
fn square_attacked_with_occ(
    board: &ShakBoard,
    sq: Square,
    by_color: Color,
    occupied: Bitboard,
    moved_pawn_sq: Square,
) -> bool {
    let pawn_attackers = attacks::pawn_attacks(by_color.other(), sq)
        & (board.by_piece(by_color.pawn()) & !Bitboard::from_square(moved_pawn_sq));
    if pawn_attackers.any() {
        return true;
    }
    if (attacks::knight_attacks(sq) & board.by_piece(by_color.knight())).any() {
        return true;
    }
    if (attacks::king_attacks(sq) & board.by_piece(by_color.king())).any() {
        return true;
    }
    let bq = board.by_piece(by_color.bishop()) | board.by_piece(by_color.queen());
    if (attacks::bishop_attacks(sq, occupied) & bq).any() {
        return true;
    }
    let rq = board.by_piece(by_color.rook()) | board.by_piece(by_color.queen());
    if (attacks::rook_attacks(sq, occupied) & rq).any() {
        return true;
    }
    false
}

fn update_castling_rights(
    rights: Bitboard,
    from: Square,
    to: Square,
    role: Role,
    stm: Color,
) -> Bitboard {
    let mut new = rights;
    // King moved: lose all rights for this color
    if role == Role::King {
        let backrank = match stm {
            Color::White => Rank::First,
            Color::Black => Rank::Eighth,
        };
        new = new & !Bitboard::from(backrank);
    }
    // Rook (or anything) moved from a castling-rights square
    if new.contains(from) {
        new = new & !Bitboard::from_square(from);
    }
    // Castling-rights square captured (a rook there is lost)
    if new.contains(to) {
        new = new & !Bitboard::from_square(to);
    }
    new
}

/// Pseudo-legal moves matching python-chess `Board.pseudo_legal_moves`.
///
/// Returns `Vec<(from_sq, to_sq, promotion)>` where `promotion` is 0 for
/// non-promotion moves or shakmaty's Role number (knight=2..queen=5) for
/// promotions. Special cases:
///   - Castling: encoded as king's from→to (e.g., e1→g1 for white kingside)
///   - En passant: encoded as pawn's from→ep_target
///
/// FoW-tolerant: includes king moves into attacked squares, captures of
/// opp king, and moves that leave own king in check. Castling moves are
/// included ONLY when fully legal (rights present, path clear, transit
/// squares safe, king not in check) — same as python-chess.
#[pyfunction]
fn pseudo_legal_moves(fen: &str) -> PyResult<Vec<(u8, u8, u8)>> {
    let setup = parse_fen_lenient(fen)?;
    Ok(gen_pseudo_legal_moves(&setup, setup.turn))
}

fn gen_pseudo_legal_moves(setup: &Setup, color: Color) -> Vec<(u8, u8, u8)> {
    let board = &setup.board;
    let own = board.by_color(color);
    let opp = board.by_color(color.other());
    let all = own | opp;
    let mut moves: Vec<(u8, u8, u8)> = Vec::with_capacity(64);

    // Pawns: pushes + double pushes + diagonal captures + promotions
    for from in board.by_piece(color.pawn()) {
        // Single push
        if let Some(to) = pawn_push(from, color) {
            if !all.contains(to) {
                if is_promotion_rank(to, color) {
                    push_promotions(&mut moves, from, to);
                } else {
                    moves.push((from as u8, to as u8, 0));
                    // Double push from starting rank, both squares empty
                    if is_pawn_start_rank(from, color) {
                        if let Some(to2) = pawn_push(to, color) {
                            if !all.contains(to2) {
                                moves.push((from as u8, to2 as u8, 0));
                            }
                        }
                    }
                }
            }
        }
        // Diagonal captures
        for to in attacks::pawn_attacks(color, from) & opp {
            if is_promotion_rank(to, color) {
                push_promotions(&mut moves, from, to);
            } else {
                moves.push((from as u8, to as u8, 0));
            }
        }
    }

    // En passant — only when adjacent pawn exists AND color matches ep rank direction
    if let Some(ep_target) = setup.ep_square {
        let ep_rank_idx = ep_target.rank() as u8;
        let valid_for_color = match color {
            Color::White => ep_rank_idx == 5,
            Color::Black => ep_rank_idx == 2,
        };
        if valid_for_color {
            let pawn_rank_idx = match color {
                Color::White => ep_rank_idx - 1,
                Color::Black => ep_rank_idx + 1,
            };
            let pawn_rank = Rank::new(pawn_rank_idx as u32);
            for adj_file in adjacent_files(ep_target.file()) {
                let pawn_sq = Square::from_coords(adj_file, pawn_rank);
                if board.by_piece(color.pawn()).contains(pawn_sq) {
                    moves.push((pawn_sq as u8, ep_target as u8, 0));
                }
            }
        }
    }

    // Knights
    for from in board.by_piece(color.knight()) {
        for to in attacks::knight_attacks(from) & !own {
            moves.push((from as u8, to as u8, 0));
        }
    }
    // Bishops
    for from in board.by_piece(color.bishop()) {
        for to in attacks::bishop_attacks(from, all) & !own {
            moves.push((from as u8, to as u8, 0));
        }
    }
    // Rooks
    for from in board.by_piece(color.rook()) {
        for to in attacks::rook_attacks(from, all) & !own {
            moves.push((from as u8, to as u8, 0));
        }
    }
    // Queens
    for from in board.by_piece(color.queen()) {
        for to in (attacks::bishop_attacks(from, all) | attacks::rook_attacks(from, all)) & !own {
            moves.push((from as u8, to as u8, 0));
        }
    }
    // King (regular moves only; castling emitted separately below)
    for from in board.by_piece(color.king()) {
        for to in attacks::king_attacks(from) & !own {
            moves.push((from as u8, to as u8, 0));
        }
    }

    // Castling — only when fully legal (matches python-chess pseudo_legal_moves)
    push_castling_moves(setup, color, &mut moves);

    moves
}

#[inline]
fn is_promotion_rank(sq: Square, color: Color) -> bool {
    match color {
        Color::White => sq.rank() == Rank::Eighth,
        Color::Black => sq.rank() == Rank::First,
    }
}

#[inline]
fn is_pawn_start_rank(sq: Square, color: Color) -> bool {
    match color {
        Color::White => sq.rank() == Rank::Second,
        Color::Black => sq.rank() == Rank::Seventh,
    }
}

#[inline]
fn push_promotions(moves: &mut Vec<(u8, u8, u8)>, from: Square, to: Square) {
    // python-chess emits in order: knight, bishop, rook, queen (low → high promotion role).
    // Setting up to match its iteration order so a sorted-by-tuple comparison can
    // optionally tighten beyond set equality.
    for promo in [Role::Knight, Role::Bishop, Role::Rook, Role::Queen] {
        moves.push((from as u8, to as u8, promo as u8));
    }
}

fn push_castling_moves(setup: &Setup, color: Color, moves: &mut Vec<(u8, u8, u8)>) {
    let castle_rights = setup.castling_rights;
    if castle_rights.is_empty() {
        return;
    }
    let board = &setup.board;
    let king_bb = board.by_piece(color.king());
    if king_bb.count() != 1 {
        return;
    }
    let king_sq = king_bb.first().unwrap();
    let opp = color.other();
    let all = board.occupied();

    if is_square_attacked(board, king_sq, opp, all) {
        return;
    }

    for rook_sq in castle_rights {
        if board.color_at(rook_sq) != Some(color) {
            continue;
        }
        if board.role_at(rook_sq) != Some(Role::Rook) {
            continue;
        }
        if rook_sq.rank() != king_sq.rank() {
            continue;
        }
        let kingside = (rook_sq.file() as u8) > (king_sq.file() as u8);
        let (king_dest_file, rook_dest_file) = if kingside {
            (File::G, File::F)
        } else {
            (File::C, File::D)
        };
        let king_dest = Square::from_coords(king_dest_file, king_sq.rank());
        let rook_dest = Square::from_coords(rook_dest_file, king_sq.rank());

        let king_path = between_inclusive(king_sq, king_dest);
        let rook_path = between_inclusive(rook_sq, rook_dest);
        let all_path = king_path | rook_path;
        let must_be_clear = all_path
            & !(Bitboard::from_square(king_sq) | Bitboard::from_square(rook_sq));
        if (must_be_clear & all) != Bitboard::EMPTY {
            continue;
        }

        let mut transit_safe = true;
        for sq in king_path {
            if is_square_attacked(board, sq, opp, all) {
                transit_safe = false;
                break;
            }
        }
        if !transit_safe {
            continue;
        }

        // python-chess emits castling as king from→to (king_dest = G or C file)
        moves.push((king_sq as u8, king_dest as u8, 0));
    }
}

fn parse_fen_lenient(fen: &str) -> PyResult<Setup> {
    let fen_parsed = Fen::from_ascii(fen.as_bytes()).map_err(|e| {
        pyo3::exceptions::PyValueError::new_err(format!("bad FEN: {e}"))
    })?;
    Ok(fen_parsed.into_setup())
}

/// Build a Setup from the same 10 bitboard-style inputs `visible_squares_bb`
/// takes. Factored out so `consistent_with_bb` can reuse the same parsing
/// path before calling `visible_squares_from_setup`.
#[inline]
#[allow(clippy::too_many_arguments)]
fn setup_from_bb(
    pawns: u64,
    knights: u64,
    bishops: u64,
    rooks: u64,
    queens: u64,
    kings: u64,
    occupied_white: u64,
    occupied_black: u64,
    castling_rights: u64,
    ep_square_idx: u32,
) -> Setup {
    let mut setup = Setup::empty();
    setup.board = ShakBoard::from_bitboards(
        shakmaty::ByRole {
            pawn: Bitboard(pawns),
            knight: Bitboard(knights),
            bishop: Bitboard(bishops),
            rook: Bitboard(rooks),
            queen: Bitboard(queens),
            king: Bitboard(kings),
        },
        shakmaty::ByColor {
            white: Bitboard(occupied_white),
            black: Bitboard(occupied_black),
        },
    );
    setup.castling_rights = Bitboard(castling_rights);
    setup.ep_square = if ep_square_idx < 64 {
        Some(unsafe { Square::new_unchecked(ep_square_idx) })
    } else {
        None
    };
    setup
}

/// Drives the full `update_opp_move` inner loop in Rust.
///
/// For each FEN in `prev_fens` where the side-to-move is the opponent:
///   1. Enumerate the opponent's pseudo-legal moves
///   2. For each move, apply it to get the next position
///   3. Check observation-consistency (visibility, pieces, captures)
///   4. If consistent, serialize the next position back to FEN
///
/// Returns the union of consistent next-FENs across all prev positions.
/// The caller dedups via set membership on the returned Vec.
///
/// Observation data is passed as 12 piece-color bitmasks (pre-extracted by
/// the Python caller from `observation.visible_pieces`) + the visibility
/// mask + two capture-square ints (i32 with -1 = None). Matches
/// `consistent_with_bb` semantics; pre-extraction keeps the per-call arg
/// list flat and avoids repeated dict iteration per (prev, move) pair.
#[pyfunction]
#[allow(clippy::too_many_arguments)]
fn update_opp_move_rust(
    prev_fens: Vec<String>,
    opp_white: bool,
    perspective_white: bool,
    obs_visibility_mask: u64,
    obs_white_pawns: u64,
    obs_white_knights: u64,
    obs_white_bishops: u64,
    obs_white_rooks: u64,
    obs_white_queens: u64,
    obs_white_kings: u64,
    obs_black_pawns: u64,
    obs_black_knights: u64,
    obs_black_bishops: u64,
    obs_black_rooks: u64,
    obs_black_queens: u64,
    obs_black_kings: u64,
    obs_own_capture_idx: i32,
    obs_opp_capture_landing_idx: i32,
) -> PyResult<Vec<String>> {
    let opp = if opp_white { Color::White } else { Color::Black };
    let perspective = if perspective_white { Color::White } else { Color::Black };
    let mut result: Vec<String> = Vec::with_capacity(prev_fens.len() * 4);

    for prev_fen in &prev_fens {
        let prev_setup = parse_fen_lenient(prev_fen)?;
        if prev_setup.turn != opp {
            continue;
        }
        let prev_own_occ = prev_setup.board.by_color(perspective).0;

        let moves = gen_pseudo_legal_moves(&prev_setup, opp);
        for (from_idx, to_idx, promo) in moves {
            let from = unsafe { Square::new_unchecked(from_idx as u32) };
            let to = unsafe { Square::new_unchecked(to_idx as u32) };
            let promo_role = role_from_int(promo);
            let next_setup = apply_move_to_setup(&prev_setup, from, to, promo_role);

            if !consistent_with_setup(
                &next_setup,
                perspective,
                prev_own_occ,
                obs_visibility_mask,
                obs_white_pawns, obs_white_knights, obs_white_bishops,
                obs_white_rooks, obs_white_queens, obs_white_kings,
                obs_black_pawns, obs_black_knights, obs_black_bishops,
                obs_black_rooks, obs_black_queens, obs_black_kings,
                obs_own_capture_idx,
                obs_opp_capture_landing_idx,
            ) {
                continue;
            }

            result.push(Fen(next_setup).to_string());
        }
    }

    Ok(result)
}

/// Shared consistency check that works on a `Setup` rather than raw
/// bitboards. Used by the top-level Rust loop driver to avoid extracting
/// bitboards from Setup just to re-pack them as function args.
#[inline]
#[allow(clippy::too_many_arguments)]
fn consistent_with_setup(
    next: &Setup,
    perspective: Color,
    prev_own_occ: u64,
    obs_visibility_mask: u64,
    obs_white_pawns: u64,
    obs_white_knights: u64,
    obs_white_bishops: u64,
    obs_white_rooks: u64,
    obs_white_queens: u64,
    obs_white_kings: u64,
    obs_black_pawns: u64,
    obs_black_knights: u64,
    obs_black_bishops: u64,
    obs_black_rooks: u64,
    obs_black_queens: u64,
    obs_black_kings: u64,
    obs_own_capture_idx: i32,
    obs_opp_capture_landing_idx: i32,
) -> bool {
    let visible = visible_squares_from_setup(next, perspective);
    if visible != obs_visibility_mask {
        return false;
    }

    let board = &next.board;
    let v = obs_visibility_mask;
    let white = board.by_color(Color::White).0;
    let black = board.by_color(Color::Black).0;

    let pawns = board.by_role(Role::Pawn).0;
    let knights = board.by_role(Role::Knight).0;
    let bishops = board.by_role(Role::Bishop).0;
    let rooks = board.by_role(Role::Rook).0;
    let queens = board.by_role(Role::Queen).0;
    let kings = board.by_role(Role::King).0;

    if (pawns & white & v) != obs_white_pawns { return false; }
    if (knights & white & v) != obs_white_knights { return false; }
    if (bishops & white & v) != obs_white_bishops { return false; }
    if (rooks & white & v) != obs_white_rooks { return false; }
    if (queens & white & v) != obs_white_queens { return false; }
    if (kings & white & v) != obs_white_kings { return false; }
    if (pawns & black & v) != obs_black_pawns { return false; }
    if (knights & black & v) != obs_black_knights { return false; }
    if (bishops & black & v) != obs_black_bishops { return false; }
    if (rooks & black & v) != obs_black_rooks { return false; }
    if (queens & black & v) != obs_black_queens { return false; }
    if (kings & black & v) != obs_black_kings { return false; }

    let next_own_occ = if perspective == Color::White { white } else { black };
    let captures = prev_own_occ & !next_own_occ;
    if obs_own_capture_idx < 0 {
        if captures != 0 {
            return false;
        }
    } else {
        let expected = 1u64 << (obs_own_capture_idx as u32);
        if captures != expected {
            return false;
        }
    }

    if obs_opp_capture_landing_idx >= 0 {
        let sq_bb = 1u64 << (obs_opp_capture_landing_idx as u32);
        let next_opp_occ = if perspective == Color::White { black } else { white };
        if (next_opp_occ & sq_bb) == 0 {
            return false;
        }
    }

    true
}

/// Hot-path observation-consistency check.
///
/// Equivalent to `fow_chess.observation.consistent_with(next, prev, obs, perspective)`,
/// but takes raw bitboards so the caller never has to serialize boards to FEN
/// or build piece maps in Python. The four observation properties are
/// pre-extracted by the Python caller and passed as 12 piece-color bitmasks
/// + two capture-square ints + visibility mask.
///
/// Returns true iff every condition holds:
///   1. `visible_squares(next, perspective) == obs.visibility_mask`
///   2. For each (piece-type, color), the next-board pieces masked by visibility
///      equal `obs.visible_pieces` restricted to that (piece-type, color)
///   3. Captures of perspective's pieces equal expectation (None → no captures;
///      Some(sq) → exactly that one square was emptied)
///   4. If `opp_capture_landing_idx >= 0`, an opponent piece is on that square
#[pyfunction]
#[allow(clippy::too_many_arguments)]
fn consistent_with_bb(
    next_pawns: u64,
    next_knights: u64,
    next_bishops: u64,
    next_rooks: u64,
    next_queens: u64,
    next_kings: u64,
    next_occ_white: u64,
    next_occ_black: u64,
    next_castling_rights: u64,
    next_ep_square_idx: u32,
    prev_own_occ: u64,
    obs_visibility_mask: u64,
    obs_white_pawns: u64,
    obs_white_knights: u64,
    obs_white_bishops: u64,
    obs_white_rooks: u64,
    obs_white_queens: u64,
    obs_white_kings: u64,
    obs_black_pawns: u64,
    obs_black_knights: u64,
    obs_black_bishops: u64,
    obs_black_rooks: u64,
    obs_black_queens: u64,
    obs_black_kings: u64,
    obs_own_capture_idx: i32,
    obs_opp_capture_landing_idx: i32,
    perspective_white: bool,
) -> bool {
    let perspective = if perspective_white { Color::White } else { Color::Black };

    // (1) Visibility match
    let setup = setup_from_bb(
        next_pawns,
        next_knights,
        next_bishops,
        next_rooks,
        next_queens,
        next_kings,
        next_occ_white,
        next_occ_black,
        next_castling_rights,
        next_ep_square_idx,
    );
    let visible = visible_squares_from_setup(&setup, perspective);
    if visible != obs_visibility_mask {
        return false;
    }

    // (2) Visible pieces: every (piece-type, color) masked by visibility equals obs
    let nw_pawn = next_pawns & next_occ_white;
    let nw_knight = next_knights & next_occ_white;
    let nw_bishop = next_bishops & next_occ_white;
    let nw_rook = next_rooks & next_occ_white;
    let nw_queen = next_queens & next_occ_white;
    let nw_king = next_kings & next_occ_white;
    let nb_pawn = next_pawns & next_occ_black;
    let nb_knight = next_knights & next_occ_black;
    let nb_bishop = next_bishops & next_occ_black;
    let nb_rook = next_rooks & next_occ_black;
    let nb_queen = next_queens & next_occ_black;
    let nb_king = next_kings & next_occ_black;

    let v = obs_visibility_mask;
    if (nw_pawn & v) != obs_white_pawns { return false; }
    if (nw_knight & v) != obs_white_knights { return false; }
    if (nw_bishop & v) != obs_white_bishops { return false; }
    if (nw_rook & v) != obs_white_rooks { return false; }
    if (nw_queen & v) != obs_white_queens { return false; }
    if (nw_king & v) != obs_white_kings { return false; }
    if (nb_pawn & v) != obs_black_pawns { return false; }
    if (nb_knight & v) != obs_black_knights { return false; }
    if (nb_bishop & v) != obs_black_bishops { return false; }
    if (nb_rook & v) != obs_black_rooks { return false; }
    if (nb_queen & v) != obs_black_queens { return false; }
    if (nb_king & v) != obs_black_kings { return false; }

    // (3) Captures of perspective's own pieces
    let next_own_occ = if perspective_white { next_occ_white } else { next_occ_black };
    let captures = prev_own_occ & !next_own_occ;
    if obs_own_capture_idx < 0 {
        if captures != 0 {
            return false;
        }
    } else {
        let expected = 1u64 << (obs_own_capture_idx as u32);
        if captures != expected {
            return false;
        }
    }

    // (4) Opp capture landing — opponent piece must sit there
    if obs_opp_capture_landing_idx >= 0 {
        let sq_bb = 1u64 << (obs_opp_capture_landing_idx as u32);
        let next_opp_occ = if perspective_white { next_occ_black } else { next_occ_white };
        if (next_opp_occ & sq_bb) == 0 {
            return false;
        }
    }

    true
}

fn visible_squares_from_setup(setup: &Setup, color: Color) -> u64 {
    let board: &ShakBoard = &setup.board;
    let own = board.by_color(color);
    let opp = board.by_color(color.other());
    let all = own | opp;

    let mut visible: Bitboard = own;

    // Pawns — pushes (if empty) + diagonal attacks (if enemy)
    for sq in board.by_piece(color.pawn()) {
        if let Some(p1) = pawn_push(sq, color) {
            if !all.contains(p1) {
                visible.add(p1);
                let on_start_rank = match color {
                    Color::White => sq.rank() == Rank::Second,
                    Color::Black => sq.rank() == Rank::Seventh,
                };
                if on_start_rank {
                    if let Some(p2) = pawn_push(p1, color) {
                        if !all.contains(p2) {
                            visible.add(p2);
                        }
                    }
                }
            }
        }
        let attacks_mask = attacks::pawn_attacks(color, sq);
        for atk_sq in attacks_mask {
            if opp.contains(atk_sq) {
                visible.add(atk_sq);
            }
        }
    }

    // Knights
    for sq in board.by_piece(color.knight()) {
        visible = visible | attacks::knight_attacks(sq);
    }

    // Bishops + queens (diagonals)
    for sq in board.by_piece(color.bishop()) {
        visible = visible | attacks::bishop_attacks(sq, all);
    }
    for sq in board.by_piece(color.queen()) {
        visible = visible | attacks::bishop_attacks(sq, all);
        visible = visible | attacks::rook_attacks(sq, all);
    }

    // Rooks
    for sq in board.by_piece(color.rook()) {
        visible = visible | attacks::rook_attacks(sq, all);
    }

    // King (attacks; castling handled below)
    for sq in board.by_piece(color.king()) {
        visible = visible | attacks::king_attacks(sq);
    }

    // En passant — add landing square + captured pawn square.
    // setup.ep_square is the FEN ep target (LANDING square). The ep RIGHT
    // belongs to whichever color can move forward to that square:
    //   - ep_target on rank 6 → only WHITE can capture
    //   - ep_target on rank 3 → only BLACK can capture
    // Other ranks (set on weird FENs) mean no real ep right for either side.
    if let Some(ep_target) = setup.ep_square {
        let ep_rank_idx = ep_target.rank() as u8;
        let valid_for_color = match color {
            Color::White => ep_rank_idx == 5, // rank 6 (0-indexed = 5)
            Color::Black => ep_rank_idx == 2, // rank 3 (0-indexed = 2)
        };
        if valid_for_color {
            // Capturing pawn must be on the rank OF the captured pawn.
            // For white capturing: ep_target rank 6, captured pawn rank 5, capturing pawn rank 5.
            // For black capturing: ep_target rank 3, captured pawn rank 4, capturing pawn rank 4.
            let pawn_rank_idx = match color {
                Color::White => ep_rank_idx - 1,
                Color::Black => ep_rank_idx + 1,
            };
            let pawn_rank = Rank::new(pawn_rank_idx as u32);
            for adj_file in adjacent_files(ep_target.file()) {
                let pawn_sq = Square::from_coords(adj_file, pawn_rank);
                if board.by_piece(color.pawn()).contains(pawn_sq) {
                    visible.add(ep_target); // landing square (Python: move.to_square)
                    let captured = Square::from_coords(ep_target.file(), pawn_rank);
                    visible.add(captured); // captured pawn's square
                }
            }
        }
    }

    add_castling_visibility(&mut visible, setup, color);

    visible.into()
}

fn pawn_push(from: Square, color: Color) -> Option<Square> {
    let new_rank_idx = match color {
        Color::White => (from.rank() as u8).checked_add(1)?,
        Color::Black => (from.rank() as u8).checked_sub(1)?,
    };
    if new_rank_idx > 7 {
        return None;
    }
    let rank = Rank::new(new_rank_idx as u32);
    Some(Square::from_coords(from.file(), rank))
}

fn adjacent_files(file: File) -> impl Iterator<Item = File> {
    let idx = file as i32;
    [idx - 1, idx + 1]
        .into_iter()
        .filter(|f| (0..8).contains(f))
        .map(|f| File::new(f as u32))
}

fn add_castling_visibility(visible: &mut Bitboard, setup: &Setup, color: Color) {
    let castle_rights = setup.castling_rights;
    if castle_rights.is_empty() {
        return;
    }
    let board = &setup.board;
    let king_bb = board.by_piece(color.king());
    if king_bb.count() != 1 {
        return; // 0 or 2+ kings — skip
    }
    let king_sq = king_bb.first().unwrap();
    let opp = color.other();
    let all = board.occupied();

    // Castle out of check is illegal
    if is_square_attacked(board, king_sq, opp, all) {
        return;
    }

    for rook_sq in castle_rights {
        if board.color_at(rook_sq) != Some(color) {
            continue;
        }
        if board.role_at(rook_sq) != Some(Role::Rook) {
            continue;
        }
        if rook_sq.rank() != king_sq.rank() {
            continue;
        }
        let kingside = (rook_sq.file() as u8) > (king_sq.file() as u8);
        let (king_dest_file, rook_dest_file) = if kingside {
            (File::G, File::F)
        } else {
            (File::C, File::D)
        };
        let king_dest = Square::from_coords(king_dest_file, king_sq.rank());
        let rook_dest = Square::from_coords(rook_dest_file, king_sq.rank());

        let king_path = between_inclusive(king_sq, king_dest);
        let rook_path = between_inclusive(rook_sq, rook_dest);
        let all_path = king_path | rook_path;
        let must_be_clear = all_path
            & !(Bitboard::from_square(king_sq) | Bitboard::from_square(rook_sq));
        if (must_be_clear & all) != Bitboard::EMPTY {
            continue;
        }

        let mut transit_safe = true;
        for sq in king_path {
            if is_square_attacked(board, sq, opp, all) {
                transit_safe = false;
                break;
            }
        }
        if !transit_safe {
            continue;
        }

        visible.add(rook_sq);
    }
}

fn between_inclusive(a: Square, b: Square) -> Bitboard {
    let rank = a.rank();
    let f_lo = (a.file() as u8).min(b.file() as u8);
    let f_hi = (a.file() as u8).max(b.file() as u8);
    let mut bb = Bitboard::EMPTY;
    for f in f_lo..=f_hi {
        let file = File::new(f as u32);
        bb.add(Square::from_coords(file, rank));
    }
    bb
}

fn is_square_attacked(
    board: &ShakBoard,
    sq: Square,
    by_color: Color,
    occupied: Bitboard,
) -> bool {
    let pawn_attackers = attacks::pawn_attacks(by_color.other(), sq)
        & board.by_piece(by_color.pawn());
    if pawn_attackers.any() {
        return true;
    }
    if (attacks::knight_attacks(sq) & board.by_piece(by_color.knight())).any() {
        return true;
    }
    if (attacks::king_attacks(sq) & board.by_piece(by_color.king())).any() {
        return true;
    }
    let bishops_queens = board.by_piece(by_color.bishop()) | board.by_piece(by_color.queen());
    if (attacks::bishop_attacks(sq, occupied) & bishops_queens).any() {
        return true;
    }
    let rooks_queens = board.by_piece(by_color.rook()) | board.by_piece(by_color.queen());
    if (attacks::rook_attacks(sq, occupied) & rooks_queens).any() {
        return true;
    }
    false
}

#[pymodule]
fn fow_rust(_py: Python, m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(ping, m)?)?;
    m.add_function(wrap_pyfunction!(fen_roundtrip, m)?)?;
    m.add_function(wrap_pyfunction!(pseudo_legal_moves, m)?)?;
    m.add_function(wrap_pyfunction!(apply_move, m)?)?;
    m.add_function(wrap_pyfunction!(update_opp_move_rust, m)?)?;
    m.add_function(wrap_pyfunction!(visible_squares, m)?)?;
    m.add_function(wrap_pyfunction!(visible_squares_bb, m)?)?;
    m.add_function(wrap_pyfunction!(consistent_with_bb, m)?)?;
    Ok(())
}
