import mongoose from "mongoose";
import {
  DEFAULT_THEME_SETTINGS,
  THEME_COLOR_FIELDS,
  THEME_MODES,
} from "./themeSettings.constants.js";

const colorSchemaDefinition = THEME_COLOR_FIELDS.reduce((acc, field) => {
  acc[field] = { type: String, required: true, trim: true };
  return acc;
}, {});

const colorPaletteSchema = new mongoose.Schema(colorSchemaDefinition, { _id: false });

const typographySchema = new mongoose.Schema(
  {
    fontFamily: { type: String, required: true, trim: true },
    baseFontSize: { type: Number, required: true },
    headingScale: { type: Number, required: true },
    lineHeight: { type: Number, required: true },
  },
  { _id: false }
);

const themeSettingsSchema = new mongoose.Schema(
  {
    singletonKey: {
      type: String,
      required: true,
      unique: true,
      default: "school-theme-settings",
      immutable: true,
      index: true,
    },
    mode: {
      type: String,
      enum: THEME_MODES,
      required: true,
      default: DEFAULT_THEME_SETTINGS.mode,
    },
    light: {
      type: colorPaletteSchema,
      required: true,
      default: () => ({ ...DEFAULT_THEME_SETTINGS.light }),
    },
    dark: {
      type: colorPaletteSchema,
      required: true,
      default: () => ({ ...DEFAULT_THEME_SETTINGS.dark }),
    },
    typography: {
      type: typographySchema,
      required: true,
      default: () => ({ ...DEFAULT_THEME_SETTINGS.typography }),
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const ThemeSettings =
  mongoose.models.ThemeSettings ||
  mongoose.model("ThemeSettings", themeSettingsSchema);

export default ThemeSettings;
export { ThemeSettings };
