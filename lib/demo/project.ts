import { generateCaptionsFromTranscript } from "@/lib/editor/captions";
import type { Project } from "@/lib/editor/types";

const demoProject: Project = {
  id: "project_relaylab_demo",
  title: "How great products earn attention",
  duration: 84.4,
  status: "planning",
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

export function createDemoProject(): Project {
  const project = structuredClone(demoProject);
  project.captions = generateCaptionsFromTranscript(project.transcript);
  return project;
}
