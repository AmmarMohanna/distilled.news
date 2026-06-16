import { demoMessages, personalNewsBriefing, processMessages, type BriefingItem, type NormalizedMessage } from "@lownoise/core";

export interface DemoOutput {
  inputMessages: NormalizedMessage[];
  items: BriefingItem[];
  suppressedCount: number;
}

export function buildDemoOutput(interestProfile: string, enabledSourceIds: string[]): DemoOutput {
  const inputMessages = demoMessages.filter((message) => enabledSourceIds.includes(message.source.id));
  const result = processMessages({
    briefing: {
      ...personalNewsBriefing,
      interestProfile
    },
    messages: inputMessages,
    now: new Date("2026-06-16T08:10:00.000Z")
  });

  return {
    inputMessages,
    items: result.publishedItems,
    suppressedCount: result.suppressed.length
  };
}
