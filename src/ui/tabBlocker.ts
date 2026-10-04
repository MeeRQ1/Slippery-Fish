/**
 * "Open in another tab" overlay shown by TabGuard. Blocks all interaction in
 * a non-active tab; "Play here instead" moves the game to this tab.
 */
export function showTabBlocker(kind: 'blocked' | 'released', onPlayHere: () => void): () => void {
  document.querySelector('.tab-blocker')?.remove();
  const el = document.createElement('div');
  el.className = 'tab-blocker';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'tab-blocker-title');
  const card = document.createElement('div');
  card.className = 'tab-blocker-card';
  const title = document.createElement('h2');
  title.id = 'tab-blocker-title';
  title.textContent = kind === 'blocked' ? 'Slippery Fish is open in another tab' : 'Continued in another tab';
  const p = document.createElement('p');
  p.textContent = kind === 'blocked'
    ? 'To keep your progress safe, only one tab plays at a time. You can keep playing there, or move the game to this tab.'
    : 'Your progress was saved and handed over to the other tab. This tab is paused so nothing is counted twice.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tab-blocker-btn';
  btn.textContent = 'PLAY HERE INSTEAD';
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'Moving the game here…';
    onPlayHere();
  });
  card.append(title, p, btn);
  el.append(card);
  document.body.append(el);
  btn.focus();
  return () => el.remove();
}
