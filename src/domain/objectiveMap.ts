import { z } from "zod";

const shortText = z.string().trim().min(1).max(500);
const bodyText = z.string().trim().min(1).max(20_000);
const questionId = z.number().int().min(1).max(40);
const mapPointSchema = z.tuple([z.number(), z.number()]);
const mapElementBase = {
  id: z.string().trim().min(1).max(100).optional(),
  opacity: z.number().min(0).max(1).optional(),
  rotate: z.number().optional(),
};
const mapPaint = {
  fill: z.string().trim().min(1).max(100).optional(),
  stroke: z.string().trim().min(1).max(100).optional(),
  strokeWidth: z.number().nonnegative().optional(),
  dashed: z.boolean().optional(),
};

const mapElementSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...mapElementBase,
    ...mapPaint,
    type: z.literal("rect"),
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
    rx: z.number().nonnegative().optional(),
  }),
  z.strictObject({
    ...mapElementBase,
    ...mapPaint,
    type: z.literal("ellipse"),
    cx: z.number(),
    cy: z.number(),
    rx: z.number().positive(),
    ry: z.number().positive(),
  }),
  z.strictObject({
    ...mapElementBase,
    ...mapPaint,
    type: z.literal("polygon"),
    points: z.array(mapPointSchema).min(3).max(200),
    lineJoin: z.enum(["miter", "round", "bevel"]).optional(),
  }),
  z.strictObject({
    ...mapElementBase,
    type: z.literal("polyline"),
    points: z.array(mapPointSchema).min(2).max(200),
    stroke: z.string().trim().min(1).max(100).optional(),
    strokeWidth: z.number().nonnegative().optional(),
    dashed: z.boolean().optional(),
    lineCap: z.enum(["butt", "round", "square"]).optional(),
    lineJoin: z.enum(["miter", "round", "bevel"]).optional(),
  }),
  z.strictObject({
    ...mapElementBase,
    type: z.literal("label"),
    x: z.number(),
    y: z.number(),
    text: bodyText.optional(),
    lines: z.array(bodyText).min(1).max(20).optional(),
    fill: z.string().trim().min(1).max(100).optional(),
    fontSize: z.number().positive().optional(),
    fontWeight: z.enum(["400", "500", "600", "700", "800"]).optional(),
    align: z.enum(["start", "middle", "end"]).optional(),
  }),
  z.strictObject({
    ...mapElementBase,
    type: z.literal("symbol"),
    x: z.number(),
    y: z.number(),
    name: z.enum([
      "bench",
      "bridge",
      "cafe",
      "door",
      "entrance",
      "info",
      "north",
      "office",
      "parking",
      "stairs",
      "toilet",
      "tree",
      "water",
    ]),
    size: z.number().positive().optional(),
    fill: z.string().trim().min(1).max(100).optional(),
    background: z.string().trim().min(1).max(100).optional(),
    label: shortText.optional(),
  }),
  z.strictObject({
    ...mapElementBase,
    type: z.literal("answerSlot"),
    questionId,
    x: z.number(),
    y: z.number(),
    w: z.number().positive().optional(),
    h: z.number().positive().optional(),
    label: shortText.optional(),
  }),
  z.strictObject({
    ...mapElementBase,
    type: z.literal("choiceMarker"),
    choiceId: shortText,
    x: z.number(),
    y: z.number(),
    r: z.number().positive().optional(),
    label: shortText.optional(),
  }),
]);

export const objectiveMapSceneSchema = z.strictObject({
  viewBox: z.strictObject({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  palette: z.record(z.string(), z.string()).optional(),
  background: z.string().trim().min(1).max(100).optional(),
  border: z.string().trim().min(1).max(100).optional(),
  borderWidth: z.number().nonnegative().optional(),
  borderRadius: z.number().nonnegative().optional(),
  grid: z.strictObject({
    xStep: z.number().positive(),
    yStep: z.number().positive(),
    stroke: z.string().trim().min(1).max(100).optional(),
    strokeWidth: z.number().nonnegative().optional(),
  }).optional(),
  elements: z.array(mapElementSchema).min(1).max(500),
});

export type ObjectiveMapScene = z.infer<typeof objectiveMapSceneSchema>;
export type ObjectiveMapElement = ObjectiveMapScene["elements"][number];
export type ObjectiveMapPoint = [number, number];
export type ObjectiveMapSymbolElement = Extract<
  ObjectiveMapElement,
  { type: "symbol" }
>;
export type ObjectiveMapAnswerSlotElement = Extract<
  ObjectiveMapElement,
  { type: "answerSlot" }
>;
