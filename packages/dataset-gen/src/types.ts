/** Structured, serializable description of a page. Fully drives HTML
 * rendering — the template functions consume one of these instead of a
 * seeded RNG directly. Written to DESIGN.md as YAML frontmatter so the
 * intent of each dataset entry is human-reviewable. */

export type SocialFeedPost = {
  user: string;
  handle: string;
  time: string;
  body: string;
  likes: number;
  reposts: number;
  avatar_seed: string;
};

export type SocialFeedDesign = {
  template: 'social_feed';
  theme: 'light' | 'dim' | 'dark';
  font: string;
  header: string;
  posts: SocialFeedPost[];
};

export type Design = SocialFeedDesign;

/** Free-form prose summary of the page, separate from the structured
 * data. Helps a human skim what a given DESIGN.md is supposed to contain
 * without reading the YAML payload. */
export type DesignDocument = {
  design: Design;
  summary: string;
};
