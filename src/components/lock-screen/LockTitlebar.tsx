import { TITLEBAR_HEIGHT } from "@shared/layout";
import WindowControls from "../WindowControls";

// The lock screens cover the titlebar, window buttons included, so they draw
// their own strip: draggable, with the minimize/maximize/close buttons on
// Windows, and room for the native traffic lights on macOS.
export default function LockTitlebar() {
  return (
    <div
      className="titlebar-drag absolute inset-x-0 top-0 flex justify-end"
      style={{ height: TITLEBAR_HEIGHT, paddingRight: 8 }}
    >
      <div className="titlebar-no-drag flex items-center">
        <WindowControls />
      </div>
    </div>
  );
}
