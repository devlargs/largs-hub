import { lazy, Suspense } from "react";
import type { Service } from "../types";
import WelcomeScreen from "./WelcomeScreen";
import SettingsPage from "./SettingsPage";
import DisabledServiceScreen from "./DisabledServiceScreen";
import RetiredNoteTakerScreen from "./RetiredNoteTakerScreen";

// The whole CHANGELOG.md rides along with this page, so it loads on first open
// rather than in the startup bundle.
const ChangelogPage = lazy(() => import("./ChangelogPage"));

// Full-pane app pages, shown while no service is active
export type AppPage = "settings" | "changelog";

interface ContentPaneProps {
  activeService: Service | null;
  activeServiceId: string | null;
  appPage: AppPage | null;
  hasServices: boolean;
  onAddService: () => void;
  onRemoveService: (serviceId: string) => void;
  onEnableService: (service: Service) => void;
}

// The area right of the sidebar. A service's own view renders natively on top
// of it; what's drawn here shows when there is no view: the welcome screen,
// an app page, or a notice for an internal or disabled service.
export default function ContentPane({
  activeService,
  activeServiceId,
  appPage,
  hasServices,
  onAddService,
  onRemoveService,
  onEnableService,
}: ContentPaneProps) {
  return (
    <div className="flex-1 relative">
      {!activeServiceId && !appPage && (
        <WelcomeScreen onAddService={onAddService} hasServices={hasServices} />
      )}
      {appPage === "settings" && !activeServiceId && <SettingsPage />}
      {appPage === "changelog" && !activeServiceId && (
        <Suspense fallback={null}>
          <ChangelogPage />
        </Suspense>
      )}
      {activeService?.type === "notion-notes" && activeService.enabled !== false && (
        <RetiredNoteTakerScreen
          service={activeService}
          onRemove={() => onRemoveService(activeService.id)}
        />
      )}
      {activeService?.enabled === false && (
        <DisabledServiceScreen
          serviceName={activeService.name}
          onEnable={() => onEnableService(activeService)}
        />
      )}
    </div>
  );
}
