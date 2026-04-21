import mongoose from "mongoose";

const appSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    group: {
      type: String,
      enum: ["general", "theme", "security", "curriculum", "notifications"],
      default: "general",
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const AppSetting = mongoose.model("AppSetting", appSettingSchema);

export default AppSetting;
export { AppSetting };
