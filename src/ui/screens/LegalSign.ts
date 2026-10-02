/**
 * Privacy & Legal — hanging sign reached from Settings. Lists the policy
 * documents (opened in a sandboxed in-app viewer, or a new tab), the honest
 * privacy-choices state, the data inventory, account/data deletion
 * explanation, purchase recovery and support.
 *
 * The bundled documents are UNREVIEWED DRAFTS with publisher placeholders;
 * a visible banner says so until real URLs are configured.
 */
import { LEGAL_LINKS } from '../../config/services';
import { POLICY_DRAFT_VERSION } from '../../services/privacy';
import { iceButton, woodButton } from '../components/buttons';
import { h } from '../dom';
import { SignScreen } from '../screen';

interface Doc { key: string; label: string; url: string; blurb: string }

function resolveUrl(u: string): string {
  try {
    return new URL(u, document.baseURI).href;
  } catch {
    return u;
  }
}

export class LegalSign extends SignScreen {
  readonly id = 'legal';
  readonly title = 'PRIVACY & LEGAL';
  protected override boardClass = 'wide';
  private viewer: HTMLElement | null = null;

  protected buildContent(c: HTMLElement): void {
    const docs: Doc[] = [
      { key: 'privacy', label: 'Privacy Policy', url: LEGAL_LINKS.privacyPolicyUrl, blurb: 'What data the game stores and why.' },
      { key: 'terms', label: 'Terms of Use', url: LEGAL_LINKS.termsUrl, blurb: 'The rules for playing.' },
      { key: 'deletion', label: 'Data Deletion & Privacy Requests', url: LEGAL_LINKS.accountDeletionUrl, blurb: 'How to erase your data or ask a privacy question.' },
      { key: 'support', label: 'Support', url: LEGAL_LINKS.supportUrl, blurb: 'Help, bug reports and contact.' },
      { key: 'notices', label: 'Third-Party Notices', url: LEGAL_LINKS.thirdPartyNoticesUrl, blurb: 'Open-source software and fonts used.' },
    ];
    const list = h('div', { class: 'legal-docs' });
    for (const d of docs) {
      list.append(h('div', { class: 'legal-doc' },
        h('div', {}, h('b', { text: d.label }), h('span', { class: 'small muted', text: d.blurb })),
        h('div', { class: 'btn-row' },
          woodButton('READ', { size: 'small', sound: 'clickSoft', onActivate: () => this.open(d) }),
          h('a', { class: 'ext-link small', text: 'Open in new tab ↗', attrs: { href: resolveUrl(d.url), target: '_blank', rel: 'noopener noreferrer' } }),
        ),
      ));
    }
    const inv = h('ul', { class: 'data-inv' });
    for (const item of this.app.privacy.dataInventory()) inv.append(h('li', {}, h('b', { text: item.what }), h('span', { class: 'small', text: ` — ${item.where}. ${item.why}.` })));
    const ads = this.app.ads.availability('fishing');

    if (LEGAL_LINKS.usingPlaceholders) {
      c.append(h('div', { class: 'draft-banner', attrs: { role: 'note' } }, h('b', { text: 'DRAFT DOCUMENTS. ' }), 'These policies are unreviewed development drafts with placeholders (like [PUBLISHER LEGAL NAME]) that the publisher must complete and have reviewed before release. They are not legal advice.'));
    }
    c.append(
      h('h3', { text: 'DOCUMENTS' }),
      list,
      h('h3', { text: 'PRIVACY CHOICES' }),
      h('div', { class: 'ice-panel legal-panel' },
        h('p', {}, h('b', { text: 'No tracking in this version. ' }), 'Slippery Fish has no analytics, no advertising SDK, no accounts and no third-party trackers, and its fonts are bundled — so there is nothing to opt in to or out of right now.'),
        h('div', { class: 'ctl-row' }, h('span', { class: 'ctl-label', text: 'Ad personalization' }), h('span', { class: 'chip off', text: 'Unavailable' })),
        h('p', { class: 'small muted', text: ads.available ? 'Rewarded ads are optional.' : `${ads.reason} If ads are added later, you will be asked for consent first where the law requires it.` }),
      ),
      h('h3', { text: 'WHAT’S STORED' }),
      inv,
      h('h3', { text: 'ACCOUNT & DATA DELETION' }),
      h('div', { class: 'ice-panel legal-panel' },
        h('p', { text: 'There is no online account to delete: this version never creates one and never sends your progress to a server.' }),
        h('p', { text: 'To erase everything, use Settings → Save & Account → Erase This Device’s Save, or clear this site’s data in your browser settings.' }),
        h('p', { class: 'small muted', text: 'Privacy questions or requests: see the Data Deletion & Privacy Requests page (contact details are a placeholder until the publisher fills them in).' }),
      ),
      h('h3', { text: 'PURCHASES' }),
      h('div', { class: 'btn-row' },
        iceButton('RECOVER PURCHASES', { class: 'small', sound: 'clickSoft', onActivate: () => void this.app.payments.recoverPurchases().then((r) => this.router.toast(r.reason)) }),
      ),
    );
  }

  private open(d: Doc): void {
    if (d.key === 'privacy') this.app.privacy.markPolicySeen(POLICY_DRAFT_VERSION);
    this.viewer?.remove();
    const frame = h('iframe', { class: 'legal-frame', attrs: { src: resolveUrl(d.url), title: d.label, sandbox: 'allow-popups allow-popups-to-escape-sandbox', referrerpolicy: 'no-referrer', loading: 'lazy' } });
    const close = (): void => { viewer.remove(); this.viewer = null; };
    const viewer = h('div', { class: 'legal-viewer', attrs: { role: 'dialog', 'aria-label': d.label } },
      h('div', { class: 'lv-bar' },
        h('b', { text: d.label }),
        h('a', { class: 'ext-link small', text: 'New tab ↗', attrs: { href: resolveUrl(d.url), target: '_blank', rel: 'noopener noreferrer' } }),
        woodButton('CLOSE', { size: 'small', sound: 'back', onActivate: close }),
      ),
      frame,
    );
    this.viewer = viewer;
    this.board.append(viewer);
    viewer.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }

  override onBack(): void {
    if (this.viewer) {
      this.viewer.remove();
      this.viewer = null;
      return;
    }
    // Opened from Settings: going back returns to the Settings sign.
    if (this.params.from === 'settings') void this.router.go('settings');
    else super.onBack();
  }
}
