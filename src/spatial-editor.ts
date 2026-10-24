import { css, html, LitElement, type PropertyValues } from "lit";
import { FloorplanCardEditor } from "./editor";
import {
  applyFloorplan,
  canvasPoint,
  metricPoint,
  type SpatialLayout,
  seedFloorplan,
  syncFloorplan,
} from "./spatial-model";
import { type Area, type FloorplanCardConfig, getFloors, type HomeAssistant } from "./types";

// A distinct tag/class lets the fork coexist with the original HACS resource.
class SpatialDrawingEditor extends FloorplanCardEditor {
  static styles = [
    ...FloorplanCardEditor.styles,
    css`
      .apply-btn, .apply-error, .floors { display: none !important; }
      :host { color-scheme: dark; }
    `,
  ];
}
if (!customElements.get("spatial-easy-floorplan-editor"))
  customElements.define("spatial-easy-floorplan-editor", SpatialDrawingEditor);

export class SpatialFloorplanEditor extends LitElement {
  static properties = {
    layout: { attribute: false },
    hass: { attribute: false },
    error: { state: true },
    selectedArea: { state: true },
  };
  declare layout?: SpatialLayout;
  declare hass?: HomeAssistant;
  declare error: string;
  declare selectedArea: string;
  constructor() {
    super();
    this.error = "";
    this.selectedArea = "";
  }
  protected updated(changed: PropertyValues) {
    const editor = this.renderRoot.querySelector<SpatialDrawingEditor>(
      "spatial-easy-floorplan-editor",
    );
    if (!editor || !this.layout) return;
    editor.hass = this.hass;
    if (changed.has("layout")) {
      const plan = syncFloorplan(this.layout).floorplan ?? seedFloorplan(this.layout);
      editor.setConfig(structuredClone(plan.config));
    }
  }
  private change(event: CustomEvent<{ config: FloorplanCardConfig }>) {
    event.stopPropagation();
    if (!this.layout) return;
    try {
      const plan = this.layout.floorplan ?? seedFloorplan(this.layout);
      const layout = applyFloorplan(this.layout, { ...plan, config: event.detail.config });
      this.error = "";
      this.dispatchEvent(
        new CustomEvent("layout-error", { detail: { error: "" }, bubbles: true, composed: true }),
      );
      this.dispatchEvent(
        new CustomEvent("layout-changed", { detail: { layout }, bubbles: true, composed: true }),
      );
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.dispatchEvent(
        new CustomEvent("layout-error", {
          detail: { error: this.error },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }
  protected render() {
    const plan = this.layout ? (this.layout.floorplan ?? seedFloorplan(this.layout)) : undefined;
    const areas = plan ? (getFloors(plan.config)[0].areas ?? []) : [];
    const area = areas.find((item) => item.id === this.selectedArea) ?? areas[0];
    return html`${this.error ? html`<p role="alert">${this.error}</p>` : ""}
      <spatial-easy-floorplan-editor @config-changed=${this.change}></spatial-easy-floorplan-editor>
      ${
        area && plan
          ? html`<details class="corners"><summary>${this.t("Edit corners in metres")}</summary>
        <p>${this.t("Insert corners for alcoves, recesses or angled walls. Drag them on the map or enter coordinates.")}</p>
        <label>${this.t("Outline")}<select @change=${(event: Event) => {
          this.selectedArea = (event.target as HTMLSelectElement).value;
        }}>${areas.map((item) => html`<option .selected=${item.id === area.id} value=${item.id}>${item.name || item.id}</option>`)}</select></label>
        ${area.points.map((point, i) => {
          const p = metricPoint(point, plan);
          return html`<div class="corner">
          <span>${i + 1}</span>
          ${(["x", "y"] as const).map(
            (axis) =>
              html`<label>${axis.toUpperCase()} (m)<input type="number" step="0.01" min="-100" max="100" aria-label=${`Corner ${i + 1} ${axis.toUpperCase()} (m)`} .value=${String(Number(p[axis].toFixed(4)))} @input=${(
                event: Event,
              ) => {
                const value = (event.target as HTMLInputElement).valueAsNumber;
                if (Number.isFinite(value))
                  this.areaEdit(area.id, (draft) => {
                    draft.points[i] = canvasPoint({ ...p, [axis]: value }, plan);
                  });
              }}></label>`,
          )}
          <button type="button" aria-label=${`Insert corner after ${i + 1}`} ?disabled=${area.points.length >= 128} @click=${() =>
            this.areaEdit(area.id, (draft) => {
              const next = draft.points[(i + 1) % draft.points.length];
              draft.points.splice(i + 1, 0, {
                x: (point.x + next.x) / 2,
                y: (point.y + next.y) / 2,
              });
            })}>${this.t("Add corner")}</button>
          <button type="button" aria-label=${`Remove corner ${i + 1}`} ?disabled=${area.points.length <= 3} @click=${() =>
            this.areaEdit(area.id, (draft) => {
              draft.points.splice(i, 1);
            })}>${this.t("Remove")}</button>
        </div>`;
        })}
      </details>`
          : ""
      }`;
  }
  private areaEdit(id: string, edit: (area: Area) => void) {
    if (!this.layout) return;
    const plan = structuredClone(this.layout.floorplan ?? seedFloorplan(this.layout));
    const area = getFloors(plan.config)[0].areas?.find((item) => item.id === id);
    if (!area) return;
    edit(area);
    this.renderRoot
      .querySelector<SpatialDrawingEditor>("spatial-easy-floorplan-editor")
      ?.applyConfigEdit(plan.config);
  }
  private t(text: string) {
    const de: Record<string, string> = {
      "Edit corners in metres": "Ecken in Metern bearbeiten",
      "Insert corners for alcoves, recesses or angled walls. Drag them on the map or enter coordinates.":
        "Füge Ecken für Nischen, Vorsprünge oder schräge Wände hinzu. Ziehe sie auf der Karte oder gib Koordinaten ein.",
      Outline: "Umriss",
      "Add corner": "Ecke hinzufügen",
      Remove: "Entfernen",
    };
    return this.hass?.language?.startsWith("de") ? (de[text] ?? text) : text;
  }
  static styles = css`
    :host { display: block; color-scheme: dark; }
    p[role="alert"] { color: var(--error-color, #ff8795); }
    .corners { margin-top: 14px; padding: 12px; border: 1px solid var(--divider-color, #555); border-radius: 10px; }
    summary { cursor: pointer; font-weight: 600; }
    .corner { display: grid; grid-template-columns: 25px 1fr 1fr auto auto; gap: 8px; align-items: end; margin-top: 10px; }
    label { display: grid; gap: 4px; font-size: 13px; }
    input, select, button { box-sizing: border-box; min-width: 0; width: 100%; color: var(--primary-text-color, #eee); background: var(--secondary-background-color, #222); border: 1px solid var(--divider-color, #555); border-radius: 7px; padding: 10px; font: inherit; }
    button { cursor: pointer; } button:disabled { opacity: 0.4; }
    @media (max-width: 600px) { .corner { grid-template-columns: 20px 1fr 1fr; } .corner button { grid-row: auto; } }
  `;
}
if (!customElements.get("spatial-floorplan-editor"))
  customElements.define("spatial-floorplan-editor", SpatialFloorplanEditor);

export type { FloorplanDocument, SpatialLayout } from "./spatial-model";
export { applyFloorplan, seedFloorplan, syncFloorplan } from "./spatial-model";
