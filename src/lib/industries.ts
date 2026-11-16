export const articleCountOptions = [3, 5, 8, 10] as const;
export type ArticleTargetCount = (typeof articleCountOptions)[number];

export type IndustryId =
  | "technology_ai"
  | "business_careers"
  | "travel_stays"
  | "health_wellness"
  | "entertainment_culture"
  | "weddings_luxury"
  | "news_policy";

export type PublicationPage = {
  label: string;
  path: string;
  kind: "home" | "latest" | "topic" | "guides" | "reviews" | "about" | "standards" | "contact" | "privacy" | "terms";
  eyebrow: string;
  title: string;
  description: string;
};

type IndustryDefinition = {
  id: IndustryId;
  label: string;
  pipelineIndustry: string;
  defaultTopic: string;
  defaultAudience: string;
  shortLabel: string;
  homeDescription: string;
  topicPage: Omit<PublicationPage, "kind">;
  guidesPage: Omit<PublicationPage, "kind">;
  reviewsPage: Omit<PublicationPage, "kind">;
};

export const industries: IndustryDefinition[] = [
  {
    id: "technology_ai", label: "Technology & AI", pipelineIndustry: "technology and AI",
    defaultTopic: "AI tools for independent creators", defaultAudience: "Independent creators and small teams",
    shortLabel: "Technology", homeDescription: "Useful technology, AI tools, and clearer ways to work.",
    topicPage: { label: "AI & creator tools", path: "ai-creator-tools", eyebrow: "TOOLS AND WORKFLOWS", title: "Tools for the work ahead", description: "A focused view of products and workflows related to {topic}, for {audience}." },
    guidesPage: { label: "Guides", path: "guides", eyebrow: "PRACTICAL GUIDES", title: "Understand the tools you use", description: "Clear guides to help {audience} make informed choices about {topic}." },
    reviewsPage: { label: "Reviews", path: "reviews", eyebrow: "REVIEWS AND COMPARISONS", title: "Look closer before you choose", description: "Considered reviews of tools and ideas connected to {topic}." },
  },
  {
    id: "business_careers", label: "Business & Careers", pipelineIndustry: "business and careers",
    defaultTopic: "Startups, careers, and the changing workplace", defaultAudience: "Early-career professionals and founders",
    shortLabel: "Business", homeDescription: "Work, money, and companies explained with practical context.",
    topicPage: { label: "Startups", path: "startups", eyebrow: "COMPANIES AND IDEAS", title: "The companies shaping the conversation", description: "A closer look at businesses and decisions related to {topic}." },
    guidesPage: { label: "Careers", path: "careers", eyebrow: "CAREER GUIDES", title: "Make your next move with context", description: "Useful career perspectives for {audience}, grounded in changes across {topic}." },
    reviewsPage: { label: "Money", path: "money", eyebrow: "MONEY AND WORK", title: "The numbers behind the headlines", description: "Clear explanations of the financial and workplace shifts connected to {topic}." },
  },
  {
    id: "travel_stays", label: "Travel & Stays", pipelineIndustry: "travel and stays",
    defaultTopic: "Thoughtful stays and local travel in India", defaultAudience: "Curious travellers and weekend explorers",
    shortLabel: "Travel", homeDescription: "Places, stays, and practical details for planning a better trip.",
    topicPage: { label: "Destinations", path: "destinations", eyebrow: "PLACES TO EXPLORE", title: "Get to know a place before you go", description: "Destination ideas and local context for travellers interested in {topic}." },
    guidesPage: { label: "Travel guides", path: "travel-guides", eyebrow: "TRAVEL GUIDES", title: "Plan the details with confidence", description: "Practical travel guidance for {audience}, shaped around {topic}." },
    reviewsPage: { label: "Stays", path: "stays", eyebrow: "STAYS AND EXPERIENCES", title: "Find a stay that fits the trip", description: "A considered look at stays, experiences, and what travellers should know about {topic}." },
  },
  {
    id: "health_wellness", label: "Health & Wellness", pipelineIndustry: "health and wellness",
    defaultTopic: "Everyday fitness, nutrition, and wellbeing", defaultAudience: "People building healthier routines",
    shortLabel: "Wellness", homeDescription: "Health and wellbeing stories with useful context and practical guidance.",
    topicPage: { label: "Wellbeing", path: "wellbeing", eyebrow: "HEALTH AND WELLBEING", title: "A clearer view of everyday wellbeing", description: "Evidence-aware coverage related to {topic}, written for {audience}." },
    guidesPage: { label: "Guides", path: "guides", eyebrow: "PRACTICAL GUIDES", title: "Small steps, better-informed choices", description: "Useful introductions to routines and health topics connected to {topic}." },
    reviewsPage: { label: "Reviews", path: "reviews", eyebrow: "PRODUCTS AND PRACTICES", title: "Consider the evidence before you try it", description: "Thoughtful reviews and explainers about products and practices around {topic}." },
  },
  {
    id: "entertainment_culture", label: "Entertainment & Culture", pipelineIndustry: "entertainment and culture",
    defaultTopic: "Film, streaming, gaming, and creator culture", defaultAudience: "Film fans and curious internet users",
    shortLabel: "Culture", homeDescription: "Film, streaming, games, and the culture around them.",
    topicPage: { label: "Watchlist", path: "watchlist", eyebrow: "WHAT TO WATCH AND PLAY", title: "Stories worth your screen time", description: "New releases and cultural shifts connected to {topic}." },
    guidesPage: { label: "Culture guides", path: "culture-guides", eyebrow: "CULTURE GUIDES", title: "The context behind what is trending", description: "Clear explainers for {audience} on the conversations shaping {topic}." },
    reviewsPage: { label: "Reviews", path: "reviews", eyebrow: "REVIEWS AND REACTIONS", title: "A closer look at the latest releases", description: "Considered reviews of films, series, games, and other work related to {topic}." },
  },
  {
    id: "weddings_luxury", label: "Weddings & Luxury", pipelineIndustry: "weddings and luxury",
    defaultTopic: "Wedding style, venues, and celebration planning", defaultAudience: "Couples and families planning a celebration",
    shortLabel: "Weddings", homeDescription: "Ideas, venues, and useful planning context for meaningful celebrations.",
    topicPage: { label: "Style", path: "style", eyebrow: "STYLE AND DETAILS", title: "A point of view on celebration style", description: "Ideas and trends related to {topic}, for {audience}." },
    guidesPage: { label: "Planning", path: "planning", eyebrow: "PLANNING GUIDES", title: "Plan the celebration one decision at a time", description: "Practical planning context and questions to consider around {topic}." },
    reviewsPage: { label: "Venues", path: "venues", eyebrow: "VENUES AND EXPERIENCES", title: "Find a setting that fits the occasion", description: "A closer look at venues and experiences connected to {topic}." },
  },
  {
    id: "news_policy", label: "News & Public Affairs", pipelineIndustry: "news and public affairs",
    defaultTopic: "Policy and current affairs affecting young people", defaultAudience: "Readers who want clear context on the news",
    shortLabel: "News", homeDescription: "Current affairs with source links and context for readers.",
    topicPage: { label: "Policy", path: "policy", eyebrow: "POLICY AND PUBLIC LIFE", title: "Understand the decisions behind the news", description: "Policy coverage and public context related to {topic}." },
    guidesPage: { label: "Explainers", path: "explainers", eyebrow: "CLEAR EXPLAINERS", title: "The context behind the headlines", description: "Accessible explainers for {audience} on issues connected to {topic}." },
    reviewsPage: { label: "Global view", path: "global-view", eyebrow: "WIDER CONTEXT", title: "See how events connect", description: "A wider view of developments and their links to {topic}." },
  },
];

export function getIndustryDefinition(id: string | undefined) {
  if (id === "Technology") return industries[0];
  if (id === "tech_hardware") return industries[0];
  return industries.find((item) => item.id === id) ?? industries[0];
}

export function getPublicationPages(industryId: string): PublicationPage[] {
  const industry = getIndustryDefinition(industryId);
  return [
    { label: "Home", path: "", kind: "home", eyebrow: "HOME", title: "Home", description: industry.homeDescription },
    { label: "Latest", path: "latest", kind: "latest", eyebrow: "LATEST STORIES", title: "The latest", description: "New stories about {topic}, selected for {audience}." },
    { ...industry.topicPage, kind: "topic" },
    { ...industry.guidesPage, kind: "guides" },
    { ...industry.reviewsPage, kind: "reviews" },
    { label: "About", path: "about", kind: "about", eyebrow: "ABOUT THIS PUBLICATION", title: "A publication with a clear focus", description: "" },
    { label: "Editorial standards", path: "editorial-standards", kind: "standards", eyebrow: "EDITORIAL STANDARDS", title: "How stories are prepared", description: "" },
    { label: "Contact", path: "contact", kind: "contact", eyebrow: "CONTACT", title: "Contact the publication", description: "" },
    { label: "Privacy", path: "privacy", kind: "privacy", eyebrow: "PRIVACY", title: "Privacy information", description: "" },
    { label: "Terms", path: "terms", kind: "terms", eyebrow: "TERMS", title: "Terms of use", description: "" },
  ];
}

export function personalizePageText(text: string, topic: string, audience: string) {
  return text.replaceAll("{topic}", topic).replaceAll("{audience}", audience);
}
