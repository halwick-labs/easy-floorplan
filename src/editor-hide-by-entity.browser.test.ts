/**
 * The editor's dimmed "hidden on the card" preview reads the entity a hide
 * rule names (issue #336).
 *
 * The editor keeps a device the card hides on screen, dimmed, so it can still
 * be found and edited. That dimming has to follow the same rule as the card,
 * and the editor called `itemHiddenWhenInactive` without `hass` exactly as the
 * card did, so it judged the rule against the device's own state instead of
 * `hideEntity`.
 */
import { afterEach, describe, expect, it } from "vitest";
import "./editor";
import type { FloorplanCardEditor } from "./editor";
import type { FloorItem, FloorplanCardConfig } from "./types";

const OWN = "light.porch";
const SWITCH = "input_boolean.button_show";
const NUMBER = "input_number.value_2h";

function config(item: Partial<FloorItem>): FloorplanCardConfig {
  return {
    type: "custom:easy-floorplan-card",
    width: 1000,
    height: 600,
    floors: [
      {
        id: "f1",
        name: "Floor 1",
        walls: [],
        openings: [],
        items: [{ id: "i1", kind: "light", x: 500, y: 300, entity: OWN, ...item } as FloorItem],
        texts: [],
        furniture: [],
        trackers: [],
        areas: [],
      },
    ],
  } as unknown as FloorplanCardConfig;
}

async function dimmed(item: Partial<FloorItem>, states: Record<string, string>) {
  const host = document.createElement("div");
  host.style.width = "900px";
  document.body.appendChild(host);
  const ed = document.createElement("easy-floorplan-card-editor") as FloorplanCardEditor;
  ed.hass = {
    states: Object.fromEntries(
      Object.entries({ [OWN]: "off", ...states }).map(([id, state]) => [
        id,
        { entity_id: id, state, attributes: {} },
      ])
    ),
    entities: {},
  } as unknown as FloorplanCardEditor["hass"];
  ed.setConfig(config(item));
  host.appendChild(ed);
  await ed.updateComplete;

  const el = ed.shadowRoot!.querySelector(".edit-item");
  expect(el, "the device should be drawn in the editor").not.toBeNull();
  document.body.innerHTML = "";
  return el!.classList.contains("card-hidden");
}

const stateRule = (operator: "==" | "!="): Partial<FloorItem> => ({
  enableHideByEntity: true,
  hideEntity: SWITCH,
  hideMode: "state",
  hideState: "on",
  hideOperator: operator,
});

describe("the editor dims a device by the entity its hide rule names", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("dims on == while the named entity matches, and not otherwise", async () => {
    expect(await dimmed(stateRule("=="), { [SWITCH]: "on" })).toBe(true);
    expect(await dimmed(stateRule("=="), { [SWITCH]: "off" })).toBe(false);
  });

  it("dims on != while the named entity differs, and not otherwise", async () => {
    expect(await dimmed(stateRule("!="), { [SWITCH]: "on" })).toBe(false);
    expect(await dimmed(stateRule("!="), { [SWITCH]: "off" })).toBe(true);
  });

  it("dims on a threshold over the named entity", async () => {
    const rule: Partial<FloorItem> = {
      enableHideByEntity: true,
      hideEntity: NUMBER,
      hideMode: "threshold",
      hideOperator: ">",
      hideThreshold: 2000,
    };
    expect(await dimmed(rule, { [NUMBER]: "2500" })).toBe(true);
    expect(await dimmed(rule, { [NUMBER]: "1500" })).toBe(false);
  });
});
