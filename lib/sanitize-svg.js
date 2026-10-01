import DOMPurify from "isomorphic-dompurify";

// Sanitize SVG/HTML lesson content before it is injected with
// dangerouslySetInnerHTML. Strips scripts, event-handler attributes,
// javascript: URLs, and foreignObject embeds while keeping the shapes,
// text, and styling the training visuals rely on.
export function sanitizeSvg(dirty) {
  if (!dirty || typeof dirty !== "string") return "";
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { svg: true },
    FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed", "link", "meta", "style"],
    FORBID_ATTR: ["on*"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}
