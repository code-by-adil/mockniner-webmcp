/** A multiple-selection group represents several separately numbered answer slots. */
export function findObjectiveQuestion(root: ParentNode, questionId: number): HTMLElement | null {
  return root.querySelector<HTMLElement>(`#question-${questionId}, #q-group-${questionId}, #question-input-${questionId}, [data-question-ids~="${questionId}"]`);
}
