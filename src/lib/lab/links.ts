/**
 * Root-relative URLs (e.g. "/crop") resolve against the serving host, so they
 * work identically on localhost, preview deploys, and production. Only true
 * http(s) links are treated as external.
 *
 * @param href - The filed-link URL from experiment content.
 * @returns True when the link points off-site.
 */
export function isExternalLabLink(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * Anchor attributes for a filed link: external links open in a new tab with
 * `noopener`; internal links navigate in the same tab (spread nothing).
 *
 * @param href - The filed-link URL from experiment content.
 * @returns Props to spread onto the anchor/LinkButton.
 *
 * @example
 * ```astro
 * <LinkButton href={link.url} {...externalLinkAttrs(link.url)}>
 * ```
 */
export function externalLinkAttrs(href: string): { target?: string; rel?: string } {
  return isExternalLabLink(href) ? { target: "_blank", rel: "noopener noreferrer" } : {};
}
