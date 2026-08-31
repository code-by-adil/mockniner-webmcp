# Provenance

## Reference implementation

The exam UI reference is the local MockNiner repository:

```text
/Users/justauser/Developer/education/ielts-react-expo-monorepo
```

This path is a development reference only. The application has no build-time or runtime dependency on it.

## Directly ported source families

The following source families were copied from MockNiner's web application and adapted only at the local application boundary:

- the fixed official exam rules now consolidated into `src/index.css`
- `src/app/layouts/UiLayerBoundary.tsx`
- `src/modules/exam-engine/ui/*`
- `src/shared/ui/exam/*`
- `src/modules/section-packs/content-json/*`
- `src/modules/section-packs/listening/ui/ListeningAudioBar.tsx`
- `src/modules/section-packs/listening/ui/ListeningExamRunner.tsx`
- `src/modules/section-packs/reading/ui/ReadingExamRunner.tsx`
- `src/modules/section-packs/writing/ui/WritingReviewView.tsx`
- `src/modules/section-packs/speaking/ui/StandardSpeakingMode.tsx`
- the Writing Part 1 and Part 2 presentation components in `src/local/LocalWritingExam.tsx`
- the shared objective rendering, exam, JSON, and Listening timeline contracts under `src/vendor/ielts-shared`

`src/index.css` is the sole styling source. It retains the official IELTS-style MockNiner exam tokens and Arial typography for both the exam and local home/results surfaces; the alternate site theme, appearance switching, chat styles, and separate font assets are not included.

## Local-only boundary

These files replace SaaS or repository-specific dependencies:

- `src/application/*` and `src/domain/session.ts`: the single command, state, persistence, sequencing, and deterministic-grading boundary
- `src/App.tsx`: renders the current application state and delegates user intentions to that command layer
- `src/local/objectiveContent.ts`: adapts original demo content to MockNiner's structured renderer contract
- `src/modules/section-packs/objective/useObjectiveSectionRuntime.ts`: renderer-local timer scheduling and submission feedback over the shared commands
- `src/infrastructure/media/listeningAudio.ts`: static offline audio and timeline URLs
- `src/infrastructure/database/*`: local SQLocal schema, migrations, and immutable objective, Writing, and Speaking attempt persistence
- `src/local/LocalWritingReview.tsx`: the narrow adapter from the local immutable Writing evaluation to MockNiner's directly ported review view
- `src/webmcp/*`: page-native Writing submission and evaluation tools over the same application command layer
- `src/shared/observability/report-error.ts`: local handled-error reporting

No authentication, subscription, production API, operational configuration, private data, secrets, or application-owned model integration is copied.
