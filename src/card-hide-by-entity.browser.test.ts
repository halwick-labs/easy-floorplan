/**
 * "Hide by condition" against another entity, on a mounted card (issue #336).
 *
 * `itemHiddenWhenInactive` is covered in the node suite, and reads `hideEntity`
 * correctly when it is handed `hass`. What the node suite cannot see is the
 * call site: the card has to pass that `hass` in. Without it the rule was
 * evaluated against the device's own state, so `==` never matched, `!=` always
 * did, and a threshold on a non-numeric device never fired, whatever the
 * named entity said.
 */
import { afterEach, describe, expect, it } from "vitest";
import "./floorplan-card";
import type { FloorplanCard } from "./floorplan-card";
import type { FloorItem, FloorplanCardConfig } from "./types";

/** The device's own entity, deliberately in a state the rules do not name. */
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
        texts: [],
        furniture: [],
        trackers: [],
        areas: [],
        items: [
          { id: "rule", kind: "light", x: 300, y: 250, entity: OWN, ...item },
          { id: "ordinary", kind: "sensor", x: 600, y: 250 },
        ],
      },
    ],
  } as unknown as FloorplanCardConfig;
}

function hass(states: Record<string, string>): FloorplanCard["hass"] {
  return {
    states: Object.fromEntries(
      Object.entries({ [OWN]: "off", ...states }).map(([id, state]) => [
        id,
        { entity_id: id, state, attributes: {} },
      ])
    ),
    entities: {},
    formatEntityState: (st: { state: string }) => st.state,
  } as unknown as FloorplanCard["hass"];
}

async function mount(item: Partial<FloorItem>, states: Record<string, string>) {
  const host = document.createElement("div");
  host.style.width = "900px";
  host.style.height = "540px";
  document.body.appendChild(host);

  const card = document.createElement("easy-floorplan-card") as FloorplanCard;
  card.setConfig(config(item));
  card.hass = hass(states);
  host.appendChild(card);
  await card.updateComplete;

  return {
    drawn: () =>
      [...card.shadowRoot!.querySelectorAll(".fp-item")]
        .map((e) => e.getAttribute("data-id"))
        .sort(),
    /** A state change in Home Assistant: a new hass, as HA hands the card. */
    async set(next: Record<string, string>) {
      card.hass = hass(next);
      await card.updateComplete;
    },
  };
}

const stateRule = (operator: "==" | "!="): Partial<FloorItem> => ({
  enableHideByEntity: true,
  hideEntity: SWITCH,
  hideMode: "state",
  hideState: "on",
  hideOperator: operator,
});

const thresholdRule: Partial<FloorItem> = {
  enableHideByEntity: true,
  hideEntity: NUMBER,
  hideMode: "threshold",
  hideOperator: ">",
  hideThreshold: 2000,
};

describe("hide by condition reads the entity it names, on the rendered card", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("hides on == while the named entity matches, and shows it otherwise", async () => {
    expect((await mount(stateRule("=="), { [SWITCH]: "on" })).drawn()).toEqual(["ordinary"]);
    document.body.innerHTML = "";
    expect((await mount(stateRule("=="), { [SWITCH]: "off" })).drawn()).toEqual([
      "ordinary",
      "rule",
    ]);
  });

  it("shows on != while the named entity matches, and hides it otherwise", async () => {
    expect((await mount(stateRule("!="), { [SWITCH]: "on" })).drawn()).toEqual([
      "ordinary",
      "rule",
    ]);
    document.body.innerHTML = "";
    expect((await mount(stateRule("!="), { [SWITCH]: "off" })).drawn()).toEqual(["ordinary"]);
  });

  it("hides on a threshold over the named entity, though the device's own state is not a number", async () => {
    expect((await mount(thresholdRule, { [NUMBER]: "2500" })).drawn()).toEqual(["ordinary"]);
    document.body.innerHTML = "";
    expect((await mount(thresholdRule, { [NUMBER]: "1500" })).drawn()).toEqual([
      "ordinary",
      "rule",
    ]);
  });

  it("follows the named entity as it changes", async () => {
    const t = await mount(stateRule("=="), { [SWITCH]: "off" });
    expect(t.drawn()).toEqual(["ordinary", "rule"]);
    await t.set({ [SWITCH]: "on" });
    expect(t.drawn()).toEqual(["ordinary"]);
    await t.set({ [SWITCH]: "off" });
    expect(t.drawn()).toEqual(["ordinary", "rule"]);
  });
});
