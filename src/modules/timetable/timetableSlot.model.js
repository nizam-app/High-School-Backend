import mongoose from "mongoose";

const timetableSlotSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["general", "class"],
      default: "class",
      index: true,
    },
    grade: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    section: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    classRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      default: null,
      index: true,
    },
    subject: {
      type: String,
      trim: true,
      required: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    room: {
      type: String,
      trim: true,
      default: "",
    },
    day: {
      type: String,
      enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      required: true,
      index: true,
    },
    startMin: {
      type: Number,
      required: true,
      min: 0,
      max: 1439,
    },
    endMin: {
      type: Number,
      required: true,
      min: 1,
      max: 1440,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isOverridden: {
      type: Boolean,
      default: false,
    },
    overrideReason: {
      type: String,
      trim: true,
      maxlength: [500, "Override reason cannot exceed 500 characters"],
      default: "",
    },
    overriddenAt: {
      type: Date,
      default: null,
    },
    effectiveDate: {
      type: Date,
      default: null,
    },
    originalSubjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null,
    },
    originalTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    originalSubject: {
      type: String,
      trim: true,
      default: "",
    },
    originalTeacherName: {
      type: String,
      trim: true,
      default: "",
    },
    totalStudents: {
      type: Number,
      default: null,
      min: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

timetableSlotSchema.pre("validate", function (next) {
  if (this.endMin <= this.startMin) {
    return next(new Error("endMin must be greater than startMin"));
  }
  next();
});

timetableSlotSchema.index({ teacher: 1, day: 1, startMin: 1, endMin: 1 });
timetableSlotSchema.index({ grade: 1, section: 1, day: 1, startMin: 1, endMin: 1 });

const TimetableSlot = mongoose.model("TimetableSlot", timetableSlotSchema);

export default TimetableSlot;
export { TimetableSlot };
