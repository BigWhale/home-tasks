/**
 * The card-level E-ink switch: it lives above the column tabs and must write
 * to the root of the config, not into the active column.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadCard, makeMockHass } from './setup.mjs';

async function editor(config) {
  const { window } = await loadCard({ force: true });
  const Editor = window.customElements.get('home-tasks-card-editor');
  const ed = new Editor();
  ed.hass = makeMockHass({
    callWS: async (m) => {
      if (m.type === 'home_tasks/get_lists') return { lists: [{ id: 'L1', name: 'Household' }] };
      if (m.type === 'home_tasks/get_external_lists') return { external_lists: [] };
      return null;
    },
  });
  ed.setConfig(config);
  window.document.body.appendChild(ed);
  await new Promise((r) => setTimeout(r, 150));

  const changes = [];
  ed.addEventListener('config-changed', (e) => changes.push(e.detail.config));
  return { ed, changes };
}

const einkSwitch = (ed) => ed.shadowRoot.querySelector('.editor-card-eink-row ha-switch');

describe('e-ink switch in the card editor', () => {
  test('sits above the column tabs, with a label and a hint', async () => {
    const { ed } = await editor({ columns: [{ list_id: 'L1' }] });
    const row = ed.shadowRoot.querySelector('.editor-card-eink-row');
    assert.ok(row, 'the row is rendered');
    assert.equal(row.querySelector('.toggle-label').textContent, 'E-ink mode');
    assert.ok(row.querySelector('.hint').textContent.length > 0, 'hint explains what it does');
    // Above the tabs: card-level, not one column's business.
    const tabs = ed.shadowRoot.querySelector('.editor-tabs');
    assert.ok(row.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING);
  });

  test('opens on what the card is doing now', async () => {
    const { ed } = await editor({ eink: true, columns: [{ list_id: 'L1' }] });
    assert.equal(einkSwitch(ed).checked, true);
    const { ed: off } = await editor({ columns: [{ list_id: 'L1' }] });
    assert.equal(einkSwitch(off).checked, false);
  });

  test('turning it on writes eink at the root, not into the column', async () => {
    const { ed, changes } = await editor({ columns: [{ list_id: 'L1' }] });
    const sw = einkSwitch(ed);
    sw.checked = true;
    sw.dispatchEvent(new ed.ownerDocument.defaultView.Event('change'));

    assert.equal(changes.length, 1, 'one config-changed');
    assert.equal(changes[0].eink, true, 'root key');
    assert.equal(changes[0].columns[0].eink, undefined, 'not in the column');
    assert.equal(changes[0].columns[0].list_id, 'L1', 'column untouched');
  });

  test('turning it off drops the key instead of persisting eink: false', async () => {
    const { ed, changes } = await editor({ eink: true, columns: [{ list_id: 'L1' }] });
    const sw = einkSwitch(ed);
    sw.checked = false;
    sw.dispatchEvent(new ed.ownerDocument.defaultView.Event('change'));

    assert.equal(changes.length, 1);
    assert.ok(!('eink' in changes[0]) || changes[0].eink === undefined,
      'the key disappears from the YAML');
  });

  test('a second column does not gain its own copy of the switch', async () => {
    const { ed } = await editor({ eink: true, columns: [{ list_id: 'L1' }, { list_id: 'L1' }] });
    assert.equal(ed.shadowRoot.querySelectorAll('.editor-card-eink-row').length, 1);
  });
});
