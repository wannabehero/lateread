import type { FC } from "hono/jsx";
import type { ReaderPreferences } from "../db/types";

interface ReaderControlsProps {
  preferences: ReaderPreferences;
}

export const ReaderControls: FC<ReaderControlsProps> = ({ preferences }) => {
  const { fontFamily, fontSize } = preferences;

  return (
    <reader-controls
      data-font-family={fontFamily}
      data-font-size={fontSize.toString()}
      data-api-url="/api/preferences/reader"
    />
  );
};
