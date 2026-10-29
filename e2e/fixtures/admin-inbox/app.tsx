// Actual shell and inbox UI, rendered only in an intercepted test document.
import { createRoot } from "react-dom/client";
import AdminGate from "../../../src/components/admin/admin-gate";
import NotificationsPage from "../../../src/app/admin/notifications/page";
createRoot(document.getElementById("inbox-qa")!).render(<AdminGate><NotificationsPage /></AdminGate>);
