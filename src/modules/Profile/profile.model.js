import mongoose from "mongoose";

const teacherInfoSchema = new mongoose.Schema(
  {
    department: { type: String, trim: true },
    qualifications: { type: String, trim: true },
    officeHours: { type: String, trim: true },
    bio: { type: String, trim: true },
  },
  { _id: false }
);

const studentInfoSchema = new mongoose.Schema(
  {
    parentName: { type: String, trim: true },
    parentPhone: { type: String, trim: true },
    parentEmail: { type: String, trim: true, lowercase: true },
  },
  { _id: false }
);

const profileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    role: {
      type: String,
      enum: ["student", "teacher", "admin"],
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email format"],
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    profileImage: {
      type: String,
      default: null,
      trim: true,
    },
    teacherInfo: {
      type: teacherInfoSchema,
      default: undefined,
    },
    studentInfo: {
      type: studentInfoSchema,
      default: undefined,
    },
  },
  { timestamps: true }
);

const Profile = mongoose.model("Profile", profileSchema);

export default Profile;
export { Profile };
