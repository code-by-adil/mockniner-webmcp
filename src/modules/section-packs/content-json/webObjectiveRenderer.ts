import { createElement, type ComponentType } from "react";
import {
  createObjectiveTestDefinition,
  type ObjectiveContentDocument,
  type TestDefinition,
  type TestPartProps,
} from "@ielts/shared";
import { ObjectivePartView } from "./ObjectivePartView";

function createPartComponent(
  part: ObjectiveContentDocument["parts"][number],
  section: ObjectiveContentDocument["section"],
): ComponentType<TestPartProps> {
  return function ObjectiveJsonPart(props) {
    return createElement(ObjectivePartView, { ...props, part, section });
  };
}

export function toWebObjectiveTestDefinition(
  document: ObjectiveContentDocument,
): TestDefinition {
  return createObjectiveTestDefinition(document, (part) =>
    createPartComponent(part, document.section),
  );
}
