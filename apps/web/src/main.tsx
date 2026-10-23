// Browser entry point: loads the styles and mounts the app.
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
