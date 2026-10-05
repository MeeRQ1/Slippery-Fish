/**
 * [PROFILE ICON] USERNAME on a snowy plaque (spec §37). Hover expands,
 * press squashes/rebounds, activation opens the Profile sign.
 */
import type { SaveManager } from '../../save/saveManager';
import { profileIconEl } from '../../profile/icons';
import { equippedTitleName } from '../../progression/titles';
import { h } from '../dom';
import { makePhysical } from './buttons';

export class IdentityPlaque {
  readonly el: HTMLButtonElement;
  private nameEl: HTMLElement;
  private titleEl: HTMLElement;
  private iconBox: HTMLElement;
  private off: () => void;

  constructor(private save: SaveManager, onOpen: () => void) {
    this.nameEl = h('span', { class: 'id-name' });
    this.titleEl = h('span', { class: 'id-title' });
    this.iconBox = h('span', { class: 'id-icon' });
    this.el = h('button', { class: 'identity-plaque snow-plaque', attrs: { type: 'button', 'aria-label': 'Open profile' } }, this.iconBox, h('span', { class: 'id-text' }, this.nameEl, this.titleEl));
    makePhysical(this.el, this.el, { personality: 'profile', onActivate: onOpen });
    this.refresh();
    this.off = save.changes.on('change', () => this.refresh());
  }

  private refresh(): void {
    const p = this.save.data.profile;
    if (this.nameEl.textContent !== p.username) this.nameEl.textContent = p.username;
    const title = equippedTitleName(this.save.data) ?? '';
    if (this.titleEl.textContent !== title) this.titleEl.textContent = title;
    if (this.iconBox.dataset.icon !== p.iconId) {
      this.iconBox.dataset.icon = p.iconId;
      this.iconBox.replaceChildren(profileIconEl(p.iconId, 46));
    }
  }

  destroy(): void {
    this.off();
    this.el.remove();
  }
}
