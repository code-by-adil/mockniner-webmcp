import { QuestionGroupHeader } from "@/shared/ui/exam/QuestionGroupHeader";
import type {
  ObjectiveWebBlockRendererProps,
} from "@/modules/section-packs/objective/types/ObjectiveWebRenderContext";

function textVariantClass(variant: "title" | "subtitle" | "body" | "muted" | undefined) {
  switch (variant) {
    case "title":
      return "text-xl font-bold leading-8 text-gray-950";
    case "subtitle":
      return "text-base font-bold leading-7 text-gray-900";
    case "muted":
      return "text-sm leading-6 text-gray-600";
    default:
      return "text-sm leading-7 text-gray-900";
  }
}

export function GroupHeaderBlock({
  block,
}: ObjectiveWebBlockRendererProps<"group_header">) {
  return <QuestionGroupHeader title={block.title} instruction={block.instruction} />;
}

export function TextBlock({ block }: ObjectiveWebBlockRendererProps<"text">) {
  return <p className={`mb-5 ${textVariantClass(block.variant)}`}>{block.text}</p>;
}

export function PassageBlock({ block }: ObjectiveWebBlockRendererProps<"passage">) {
  return (
    <article className="space-y-5 text-sm leading-7 text-gray-900">
      <h3 className="text-lg font-bold leading-7 text-gray-950">{block.title}</h3>
      {block.paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </article>
  );
}

export function SpacerBlock({ block }: ObjectiveWebBlockRendererProps<"spacer">) {
  return <div style={{ height: block.size ?? 24 }} />;
}
