import type { JsonValue } from "./json.js";

export type SettingRecord = {
  id: string;
  key: string;
  value: JsonValue;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

