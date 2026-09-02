import type { Project } from "./types";

const blankProject: Project = {
  id: "project_relaylab_local",
  title: "Untitled project",
  duration: 0,
  status: "planning",
  baseVideo: {
    id: "base_empty",
    name: "No base video",
    duration: 0,
    objectUrl: null,
  },
  transcript: [],
  brollAssets: [],
  overlays: [],
  generationSuggestions: [],
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

export function createBlankProject(): Project {
  return structuredClone(blankProject);
}
