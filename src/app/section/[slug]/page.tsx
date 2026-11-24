import { permanentRedirect } from "next/navigation";

/** Sections are gone: Night Reports is the only blog. Old links land there. */
export default function SectionRedirect() {
  permanentRedirect("/night-reports");
}
