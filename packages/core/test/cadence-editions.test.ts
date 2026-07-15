import { describe, expect, it } from "vitest";
import { buildBriefingEdition, getDueBriefingWindow, personalNewsBriefing, sanitizeEditionSectionForLanguage, synthesizeEditionNarrativeSummary } from "../src";
import type { NormalizedMessage } from "../src";

describe("briefing cadence", () => {
  it("creates an hourly window when the briefing is due", () => {
    const window = getDueBriefingWindow(
      {
        ...personalNewsBriefing,
        briefingCadence: "hourly",
        nextBriefingAt: "2026-06-16T09:00:00.000Z"
      },
      new Date("2026-06-16T09:02:00.000Z")
    );

    expect(window).toEqual({
      cadence: "hourly",
      windowStart: "2026-06-16T08:00:00.000Z",
      windowEnd: "2026-06-16T09:00:00.000Z",
      nextBriefingAt: "2026-06-16T10:00:00.000Z"
    });
  });

  it("does not create a window before the next briefing time", () => {
    expect(getDueBriefingWindow(
      { ...personalNewsBriefing, nextBriefingAt: "2026-06-16T09:00:00.000Z" },
      new Date("2026-06-16T08:59:00.000Z")
    )).toBeNull();
  });

  it("falls back to UTC for invalid timezones", () => {
    const window = getDueBriefingWindow(
      {
        ...personalNewsBriefing,
        briefingTimezone: "Not/AZone",
        nextBriefingAt: undefined
      },
      new Date("2026-06-16T09:02:00.000Z")
    );

    expect(window?.windowEnd).toBe("2026-06-16T09:00:00.000Z");
  });
});

describe("briefing editions", () => {
  it("builds one edition from a window of matching messages", () => {
    const message: NormalizedMessage = {
      id: "briefing_default::msg_power",
      source: { id: "src_power", title: "Power Wire", type: "channel", provider: "telegram", kind: "telegram_channel" },
      messageId: "msg_power",
      text: "Electricite du Liban announced two extra hours of power supply tonight.",
      links: [],
      media: [],
      postedAt: "2026-06-16T08:15:00.000Z",
      receivedAt: "2026-06-16T08:15:10.000Z",
      sourceUrl: "https://t.me/power/1",
      expiresAt: "2026-07-01T08:15:00.000Z"
    };

    const edition = buildBriefingEdition({
      briefing: personalNewsBriefing,
      messages: [message],
      windowStart: "2026-06-16T08:00:00.000Z",
      windowEnd: "2026-06-16T09:00:00.000Z",
      now: new Date("2026-06-16T09:00:10.000Z")
    });

    expect(edition.status).toBe("published");
    expect(edition.title).toBe("Updates");
    expect(edition.summary).toBe("Electricite du Liban announced two extra hours of power supply tonight [1].");
    expect(edition.sections).toHaveLength(1);
    expect(edition.sections[0].evidence[0].messageId).toBe(message.id);
  });

  it("does not mislabel a technology story as economy because its evidence mentions market appetite", () => {
    const message: NormalizedMessage = {
      id: "technology::starship",
      source: { id: "src_technology", title: "Tech source", type: "channel", provider: "rss", kind: "rss_feed" },
      messageId: "starship",
      text: "SpaceX cleared to fly Starship again after a booster failure in May. The test will show the market's appetite for the company's development approach.",
      links: [],
      media: [],
      postedAt: "2026-07-13T14:19:44.000Z",
      receivedAt: "2026-07-13T14:20:00.000Z",
      sourceUrl: "https://example.com/starship",
      expiresAt: "2026-07-28T14:19:44.000Z"
    };

    const edition = buildBriefingEdition({
      briefing: { ...personalNewsBriefing, interestProfile: "technology SpaceX", intensity: "high" },
      messages: [message],
      windowStart: "2026-07-13T14:00:00.000Z",
      windowEnd: "2026-07-13T15:00:00.000Z",
      now: new Date("2026-07-13T15:00:10.000Z")
    });

    expect(edition.sections[0].title).toBe("Update");
  });

  it("localizes edition chrome for Arabic feeds", () => {
    const edition = buildBriefingEdition({
      briefing: { ...personalNewsBriefing, language: "ar" },
      messages: [],
      windowStart: "2026-06-16T08:00:00.000Z",
      windowEnd: "2026-06-16T09:00:00.000Z",
      now: new Date("2026-06-16T09:00:10.000Z")
    });

    expect(edition.title).toBe("التحديثات");
    expect(edition.summary).toBe("لا توجد تحديثات ذات صلة في هذه النافذة.");
    expect(edition.sections[0].title).toBe("لا تحديثات");
  });

  it("cleans bilingual Telegram artifacts from Arabic editions", () => {
    const message: NormalizedMessage = {
      id: "briefing_default::msg_bintjbeil",
      source: { id: "src_bintjbeil", title: "bintjbeil.org - موقع بنت جبيل", type: "channel", provider: "telegram", kind: "telegram_channel" },
      messageId: "msg_bintjbeil",
      text: "نتنياهو: وجهنا ضربة إلى إيران ووكلائها في المنطقة وهي عملية لم تنته بعد\nNetanyahu: We have struck Iran and its proxies in the region, and the operation is not over yet\nــــــــــــــ\nقناة موقع بنت جبيل على واتساب",
      links: [],
      media: [],
      postedAt: "2026-06-23T09:58:00.000Z",
      receivedAt: "2026-06-23T09:58:20.000Z",
      sourceUrl: "https://t.me/bintjbeilnews/1",
      expiresAt: "2026-07-08T09:58:00.000Z"
    };

    const edition = buildBriefingEdition({
      briefing: { ...personalNewsBriefing, language: "ar", intensity: "medium" },
      messages: [message],
      windowStart: "2026-06-23T09:00:00.000Z",
      windowEnd: "2026-06-23T10:00:00.000Z",
      now: new Date("2026-06-23T10:00:00.000Z")
    });

    expect(edition.summary).toBe("نتنياهو: وجهنا ضربة إلى إيران ووكلائها في المنطقة وهي عملية لم تنته بعد [1].");
    expect(edition.sections[0].summary).toBe("نتنياهو: وجهنا ضربة إلى إيران ووكلائها في المنطقة وهي عملية لم تنته بعد");
    expect(edition.sections[0].evidence[0].text).toBe("نتنياهو: وجهنا ضربة إلى إيران ووكلائها في المنطقة وهي عملية لم تنته بعد");
  });

  it("repairs saved Arabic section summaries that were cut from full evidence", () => {
    const fullText = "الرئاسة اللبنانية: شكر الرئيس عون نائب الرئيس الاميركي ووزير الخارجية على الاهتمام الذي تبديه الولايات المتحدة حيال لبنان بهدف انهاء الحرب فيه وتعزيز سلطة الدولة اللبنانية واستقلالية قرارها باعتبارها المسؤولة وحدها عن حفظ";
    const cutSummary = [...fullText].slice(0, 220).join("");
    expect(cutSummary).toMatch(/عن حف$/u);

    const section = sanitizeEditionSectionForLanguage(
      {
        title: "تحديثات",
        summary: cutSummary,
        evidence: [
          {
            messageId: "presidency-update",
            sourceId: "src_lbci",
            sourceTitle: "LBCI_NEWS",
            sourceType: "channel",
            sourceProvider: "apify",
            sourceKind: "x_profile",
            postedAt: "2026-06-23T14:53:00.000Z",
            text: fullText,
            links: [],
            media: []
          }
        ]
      },
      "ar"
    );

    expect(section.summary).toBe(fullText);
  });

  it("synthesizes multiple updates into one referenced paragraph", () => {
    const summary = synthesizeEditionNarrativeSummary(
      [
        {
          title: "Infrastructure",
          summary: "Electricite du Liban announced two extra hours of power supply tonight.",
          evidence: []
        },
        {
          title: "Security",
          summary: "The army reopened the coastal road after a security incident.",
          evidence: []
        }
      ],
      "hourly",
      "en"
    );

    expect(summary).toBe(
      "Electricite du Liban announced two extra hours of power supply tonight [1]. The army reopened the coastal road after a security incident [2]."
    );
  });

  it("caps hourly synthesis to a medium paragraph with practical references", () => {
    const sections = Array.from({ length: 8 }, (_, index) => ({
      title: "Update",
      summary: `Update ${index + 1} adds confirmed context about public services, official timing, affected neighborhoods, operational limits, and what residents should expect before the next scheduled notice from authorities.`,
      evidence: []
    }));

    const summary = synthesizeEditionNarrativeSummary(sections, "hourly", "en");

    expect(summary).toContain("[1]");
    expect(summary).not.toContain("[7]");
    expect(summary.split(/\s+/u).filter(Boolean).length).toBeLessThanOrEqual(150);
  });

  it("groups multiple raw items into one reference bundle when they support the same point", () => {
    const messages: NormalizedMessage[] = [
      {
        id: "briefing_default::power_a",
        source: { id: "src_power_a", title: "Power Wire", type: "channel", provider: "telegram", kind: "telegram_channel" },
        messageId: "power-a",
        text: "Electricite du Liban confirmed two additional hours of power supply tonight after fuel shipments arrived.",
        links: [],
        media: [],
        postedAt: "2026-06-16T08:15:00.000Z",
        receivedAt: "2026-06-16T08:15:10.000Z",
        sourceUrl: "https://t.me/powerA/1",
        expiresAt: "2026-07-01T08:15:00.000Z"
      },
      {
        id: "briefing_default::power_b",
        source: { id: "src_power_b", title: "North Updates", type: "channel", provider: "telegram", kind: "telegram_channel" },
        messageId: "power-b",
        text: "Electricite du Liban confirmed two additional hours of power supply tonight after fuel shipments arrived.",
        links: [],
        media: [],
        postedAt: "2026-06-16T08:18:00.000Z",
        receivedAt: "2026-06-16T08:18:10.000Z",
        sourceUrl: "https://t.me/powerB/1",
        expiresAt: "2026-07-01T08:18:00.000Z"
      }
    ];

    const edition = buildBriefingEdition({
      briefing: personalNewsBriefing,
      messages,
      windowStart: "2026-06-16T08:00:00.000Z",
      windowEnd: "2026-06-16T09:00:00.000Z",
      now: new Date("2026-06-16T09:00:10.000Z")
    });

    expect(edition.sections).toHaveLength(1);
    expect(edition.sections[0].evidence).toHaveLength(2);
    expect(edition.summary).toContain("[1]");
  });

  it("publishes an explicit empty edition when nothing meaningful happened", () => {
    const edition = buildBriefingEdition({
      briefing: personalNewsBriefing,
      messages: [],
      windowStart: "2026-06-16T08:00:00.000Z",
      windowEnd: "2026-06-16T09:00:00.000Z",
      now: new Date("2026-06-16T09:00:10.000Z")
    });

    expect(edition.status).toBe("empty");
    expect(edition.summary).toBe("No relevant updates in this window.");
  });

  it("treats Lebanese local security incidents as relevant without an explicit Lebanon token", () => {
    const message: NormalizedMessage = {
      id: "briefing_default::nabatieh_security",
      source: { id: "src_local", title: "Local Wire", type: "channel", provider: "telegram", kind: "telegram_channel" },
      messageId: "nabatieh-security",
      text: "مراسل الجديد: مسيرة إسرائيلية تلقي قنبلة صوتية في كفرتبنيت قضاء النبطية",
      links: [],
      media: [],
      postedAt: "2026-06-23T07:08:50.000Z",
      receivedAt: "2026-06-23T08:06:45.000Z",
      sourceUrl: "https://t.me/local/1",
      expiresAt: "2026-07-08T07:08:50.000Z"
    };

    const edition = buildBriefingEdition({
      briefing: {
        ...personalNewsBriefing,
        language: "ar",
        interestProfile: "Track Lebanese security, economy, infrastructure, public safety, and major regional events."
      },
      messages: [message],
      windowStart: "2026-06-23T07:00:00.000Z",
      windowEnd: "2026-06-23T08:00:00.000Z",
      now: new Date("2026-06-23T08:08:00.000Z")
    });

    expect(edition.status).toBe("published");
    expect(edition.summary).toContain("قنبلة صوتية");
    expect(edition.sections[0].summary).toContain("قنبلة صوتية");
  });

  it("normalizes Arabic topic forms for concrete Lebanese local incidents", () => {
    const message: NormalizedMessage = {
      id: "briefing_default::bint-jbeil-demolition",
      source: { id: "src_nna", title: "الوكالة الوطنية", type: "channel", provider: "rss", kind: "rss_feed" },
      messageId: "bint-jbeil-demolition",
      text: "الوكالة الوطنية: الجيش الإسرائيلي نفذ تفجيراً كبيراً في بلدة كونين قضاء بنت جبيل.",
      links: [],
      media: [],
      postedAt: "2026-07-14T04:50:18.000Z",
      receivedAt: "2026-07-14T04:51:12.000Z",
      sourceUrl: "https://example.com/bint-jbeil-demolition",
      expiresAt: "2026-07-29T04:50:18.000Z"
    };

    const edition = buildBriefingEdition({
      briefing: {
        ...personalNewsBriefing,
        title: "Lebanese News",
        language: "ar",
        intensity: "low",
        interestProfile: "تابع الأخبار اللبنانية المهمة: الأمن، الجنوب، الحدود، الاقتصاد، البنية التحتية، الكهرباء، القرارات الرسمية، السلامة العامة، والأحداث الإقليمية التي تؤثر مباشرة على لبنان."
      },
      messages: [message],
      windowStart: "2026-07-14T04:00:00.000Z",
      windowEnd: "2026-07-14T05:00:00.000Z",
      now: new Date("2026-07-14T04:58:15.000Z")
    });

    expect(edition.status).toBe("published");
    expect(edition.sections[0].summary).toContain("تفجيراً");
  });
});
