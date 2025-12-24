import type { FC } from "hono/jsx";
import type { SummaryResult } from "../lib/llm";

interface SummaryViewProps {
  summary: SummaryResult;
}

export const SummaryView: FC<SummaryViewProps> = ({ summary }) => {
  return (
    <div class="summary-container">
      <div class="summary-section">
        <h4>One Sentence</h4>
        <p>{summary.oneSentence}</p>
      </div>

      <div class="summary-section">
        <h4>One Paragraph</h4>
        <p>{summary.oneParagraph}</p>
      </div>

      <details class="summary-section">
        <summary>
          <strong>Detailed</strong>
        </summary>
        <p style="white-space: pre-wrap; margin-top: 1rem;">{summary.long}</p>
      </details>
    </div>
  );
};
