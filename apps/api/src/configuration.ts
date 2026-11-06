import { Setting } from "./models.js";
import { defaultCommunityConfig, communityConfigSchema } from "@roast/domain";
export async function communityConfiguration() {
  const setting = await Setting.findOne({ key: "community-config" }).lean();
  return setting
    ? communityConfigSchema.parse(setting.value)
    : defaultCommunityConfig;
}
