import mongoose from "mongoose";

const ALLOWED_GRADING_SYSTEMS = ["percentage", "gpa", "letter"];
const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const generalSettingsSchema = new mongoose.Schema(
  {
    singletonKey: {
      type: String,
      required: true,
      unique: true,
      default: "school-general-settings",
      immutable: true,
      index: true,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
    },
    gradingSystem: {
      type: String,
      enum: ALLOWED_GRADING_SYSTEMS,
      required: true,
      default: "percentage",
    },
    defaultClassDuration: {
      type: Number,
      required: true,
      min: 1,
      default: 45,
    },
    schoolStartTime: {
      type: String,
      required: true,
      trim: true,
      match: [TIME_24H_REGEX, "schoolStartTime must be in HH:MM format"],
      default: "08:00",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const GeneralSettings =
  mongoose.models.GeneralSettings ||
  mongoose.model("GeneralSettings", generalSettingsSchema);

export default GeneralSettings;
export { GeneralSettings, ALLOWED_GRADING_SYSTEMS, TIME_24H_REGEX };
