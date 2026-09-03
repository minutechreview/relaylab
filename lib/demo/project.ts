import { generateCaptionsFromTranscript } from "@/lib/editor/captions";
import type { Project } from "@/lib/editor/types";

const demoProject: Project = {
  id: "project_relaylab_demo",
  title: "How great products earn attention",
  duration: 84.4,
  status: "planning",
  aspectRatio: "16:9",
  baseVideo: {
    id: "base_founder_story",
    name: "founder-story.mp4",
    duration: 84.4,
    objectUrl: null,
  },
  transcript: [
    {
      id: "tr_1",
      start: 0,
      end: 8.6,
      text: "Most products do not have an attention problem. They have a clarity problem.",
    },
    {
      id: "tr_2",
      start: 8.6,
      end: 18.2,
      text: "The moment someone opens your product, three things should become obvious.",
    },
    {
      id: "tr_3",
      start: 18.2,
      end: 28.8,
      text: "First, show the outcome. Let people see the finished work before you explain every control.",
    },
    {
      id: "tr_4",
      start: 28.8,
      end: 41.4,
      text: "Second, remove the empty state. A realistic example teaches faster than a page full of instructions.",
    },
    {
      id: "tr_5",
      start: 41.4,
      end: 55.2,
      text: "Third, keep the next action small. One confident step creates momentum.",
    },
    {
      id: "tr_6",
      start: 55.2,
      end: 68.8,
      text: "I wanted the system to feel like an AI manager watching everything happening across the store.",
    },
    {
      id: "tr_7",
      start: 68.8,
      end: 84.4,
      text: "Clarity earns attention. Once people see progress, they are willing to learn the rest.",
    },
  ],
  brollAssets: [
    {
      id: "workspace_reel",
      name: "workspace-reel.mp4",
      duration: 96,
      objectUrl: null,
      moments: [
        {
          id: "moment_workspace_overhead",
          assetId: "workspace_reel",
          sourceStart: 12.4,
          sourceEnd: 20.2,
          description: "Overhead view of a designer arranging interface sketches beside a laptop.",
          tags: ["design", "workspace", "sketches", "planning", "overhead"],
        },
        {
          id: "moment_workspace_review",
          assetId: "workspace_reel",
          sourceStart: 48.1,
          sourceEnd: 57.6,
          description: "Close-up of a product team reviewing a clean application prototype.",
          tags: ["product", "prototype", "software", "team", "close-up"],
        },
      ],
    },
    {
      id: "product_reel",
      name: "product-reel.mp4",
      duration: 72,
      objectUrl: null,
      moments: [
        {
          id: "moment_product_result",
          assetId: "product_reel",
          sourceStart: 8.2,
          sourceEnd: 15.4,
          description: "A polished project dashboard fills with completed visual work.",
          tags: ["software", "dashboard", "result", "progress", "interface"],
        },
        {
          id: "moment_product_action",
          assetId: "product_reel",
          sourceStart: 31.6,
          sourceEnd: 39.1,
          description: "A cursor selects one clear primary action in a minimal product interface.",
          tags: ["interface", "action", "cursor", "onboarding", "minimal"],
        },
      ],
    },
    {
      id: "city_reel",
      name: "city-reel.mp4",
      duration: 110,
      objectUrl: null,
      moments: [
        {
          id: "moment_city_momentum",
          assetId: "city_reel",
          sourceStart: 74.2,
          sourceEnd: 80.1,
          description: "Fast-moving pedestrians cross a bright city intersection at morning rush hour.",
          tags: ["city", "people", "motion", "momentum", "morning"],
        },
      ],
    },
    {
      id: "cafe_reel",
      name: "cafe-source-reel.mp4",
      duration: 92,
      objectUrl: null,
      moments: [
        {
          id: "moment_cafe_pos",
          assetId: "cafe_reel",
          sourceStart: 14.5,
          sourceEnd: 21.2,
          description: "A cafe employee enters an order on a point-of-sale terminal.",
          tags: ["cafe", "employee", "point of sale", "order", "terminal"],
        },
        {
          id: "moment_cafe_coffee",
          assetId: "cafe_reel",
          sourceStart: 46.8,
          sourceEnd: 53.4,
          description: "Close-up of a barista preparing coffee behind the counter.",
          tags: ["cafe", "barista", "coffee", "preparation", "close-up"],
        },
      ],
    },
  ],
  overlays: [
    {
      id: "ov_demo_1",
      assetId: "product_reel",
      momentId: "moment_product_result",
      sourceStart: 8.2,
      sourceEnd: 14,
      timelineStart: 19.2,
      timelineEnd: 25,
      status: "ghost",
      lockedByHuman: false,
      reason: "Show the outcome as the speaker introduces the first principle.",
      createdBy: "agent",
    },
  ],
  generationSuggestions: [
    {
      id: "gen_demo_manager",
      timelineStart: 56,
      timelineEnd: 61,
      duration: 5,
      prompt:
        "Over-the-shoulder shot of a restaurant manager viewing a live operations dashboard on a tablet, multiple store metrics visible, realistic cafe environment, cinematic but natural, subtle camera motion, no dialogue, no text overlays",
      reason:
        "The speaker describes an AI manager watching operations, but the POS and coffee footage do not communicate the cross-store dashboard concept.",
      status: "suggested",
      createdBy: "agent",
    },
  ],
  captions: [],
  captionStyle: {
    position: "bottom",
  },
  pacingPreference: {
    maxTalkingHeadSeconds: 15,
  },
  timelineRevision: 0,
  humanPreferences: [],
};

/**
 * Real 65s talking-head recording + its actual transcript (extracted with
 * local Whisper, not written by hand), used only by the "showcase" variant
 * below. Bundled at public/demo/avatar-declutter.mp4.
 */
const SHOWCASE_TRANSCRIPT: Project["transcript"] = [
  { id: "tr_1", start: 0, end: 6.3, text: "I deleted 30 AI tools from my phone last month, and honestly, I got more done." },
  { id: "tr_2", start: 6.3, end: 9.7, text: "Here's the thing nobody tells you when you're starting out with AI tools." },
  { id: "tr_3", start: 9.7, end: 12.9, text: "You don't have a tool problem, you have a collecting problem." },
  { id: "tr_4", start: 12.9, end: 16.4, text: "Every week there's a new tool, a new game changer." },
  { id: "tr_5", start: 16.4, end: 20.0, text: "A new thing you absolutely need to try, so you download it," },
  { id: "tr_6", start: 20.0, end: 24.1, text: "bookmark it, maybe open it once, and it just sits there." },
  { id: "tr_7", start: 24.1, end: 28.3, text: "With the other 40 tools you were going to get to, I had tools for writing," },
  { id: "tr_8", start: 28.3, end: 32.7, text: "tools for images, tools for research, tools for summarizing the tools I wasn't using." },
  { id: "tr_9", start: 32.7, end: 37.0, text: "It's a lot, and the worst part, the more tools you have, the less you actually do," },
  { id: "tr_10", start: 37.0, end: 40.6, text: "because you spend all your time picking which one to use instead of just" },
  { id: "tr_11", start: 41.8, end: 47.6, text: "using one. So I deleted everything I hadn't opened in two weeks," },
  { id: "tr_12", start: 48.2, end: 54.1, text: "kept three tools, just three, one for writing, one for images, one for research, that's it." },
  { id: "tr_13", start: 54.6, end: 59.0, text: "And within a week I had actually finished things, real things," },
  { id: "tr_14", start: 59.6, end: 64.9, text: "not just tabs, you don't need more tools, you need to go deeper with the ones you already have." },
];

export interface CreateDemoProjectOptions {
  /**
   * Swaps in the real bundled talking-head video + its real transcript, and
   * clears the placeholder B-roll/overlay/generation-suggestion fixtures —
   * those were written to match the old synthetic "product clarity"
   * narration and would be thematically mismatched against real footage.
   * Used by the live /demo route. Defaults to false so the large existing
   * test-fixture surface (~29 files import createDemoProject) keeps getting
   * the original deterministic content unchanged.
   */
  showcase?: boolean;
}

export function createDemoProject(options: CreateDemoProjectOptions = {}): Project {
  const project = structuredClone(demoProject);
  if (options.showcase) {
    project.title = "Why I deleted 30 AI tools";
    project.duration = 64.9;
    project.aspectRatio = "9:16";
    project.baseVideo = {
      id: "base_avatar_declutter",
      name: "avatar-declutter.mp4",
      duration: 64.9,
      objectUrl: "/demo/avatar-declutter.mp4",
    };
    project.transcript = SHOWCASE_TRANSCRIPT;
    project.brollAssets = [];
    project.overlays = [];
    project.generationSuggestions = [];
  }
  project.captions = generateCaptionsFromTranscript(project.transcript);
  return project;
}
