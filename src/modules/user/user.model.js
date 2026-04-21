

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["student", "teacher", "admin"],
      default: "student",
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
      unique: true,
      sparse: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      match: [/^[234]\d{7}$/, "Phone number must be 8 digits and start with 2, 3, or 4"],
    },

 
    // Teacher can be assigned to ONE subject only
    subject: {
      type: String,
      trim: true,
      required: function () {
        return this.role === "teacher" && !this.subjectId;
      },
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null,
    },

    // Teacher can teach MULTIPLE grades (e.g., 5th, 6th)
    assignedGrades: {
      type: [String],
      enum: ["4th", "5th", "6th", "7th"],
      default: [],
      validate: {
        validator: function (grades) {
          // Only validate for teachers
          // if (this.role === "teacher") {
          //   return (grades && grades.length > 0) || (this.assignedGradeIds || []).length > 0;
          // }
          if (this.role === "teacher") return true;

        },
        message: "Teacher must be assigned to at least one grade",
      },
    },
    assignedGradeIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Grade" }],
      default: [],
    },


    // Student belongs to ONE grade level only
    gradeLevel: {
      type: String,
      enum: ["4th", "5th", "6th", "7th"],
      required: function () {
        return this.role === "student" && !this.gradeId;
      },
    },
    gradeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Grade",
      default: null,
    },

    // Student can be enrolled in MULTIPLE subjects
    // assignedSubjects: {
    //   type: [String],
    //   default: [],
    //   validate: {
    //     validator: function (subjects) {
    //       // Only validate for students
    //       if (this.role === "student") {
    //         return (subjects && subjects.length > 0) || (this.assignedSubjectIds || []).length > 0;
    //       }
    //       return true;
    //     },
    //     message: "Student must be assigned to at least one subject",
    //   },
    // },
    assignedSubjects: {
  type: [String],
  default: [],
},

    assignedSubjectIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
      default: [],
    },

    pin: {
      type: String,
      required: true,
      match: [/^\d{4}$/, "PIN must be exactly 4 digits"],
      select: false,
    },

    status: {
      type: String,
      enum: ["active", "blocked"],
      default: "active",
    },

    phoneVerified: {
      type: Boolean,
      default: false,
    },

    // OTP verification state (stored on user document)
    otpHash: {
      type: String,
      default: null,
      select: false,
    },
    expiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },

    // Track how user was created
    createdVia: {
      type: String,
      enum: ["signup", "admin"],
      default: "signup",
    },

    // Admin who created the user (if any)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
      default: null,
      select: false,
    },
    twoFactorTempSecret: {
      type: String,
      default: null,
      select: false,
    },
    twoFactorBackupCodes: {
      type: [String],
      default: [],
      select: false,
    },
    twoFactorEnabledAt: {
      type: Date,
      default: null,
    },
    twoFactorFailedAttempts: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },
    twoFactorLockedUntil: {
      type: Date,
      default: null,
      select: false,
    },

    // Cached student performance metrics (updated by teacher/student listing flows)
    studentMetrics: {
      totalAvailableClassesForGrade: { type: Number, default: 0 },
      averageAssignmentScore: { type: Number, default: 0 }, // percentage (0-100)
      averageAssignmentRawScore: { type: Number, default: 0 }, // arithmetic mean of graded scores
      gradedAssignmentsCount: { type: Number, default: 0 },
      updatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// Hash PIN before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("pin")) return next();
  this.pin = await bcrypt.hash(this.pin, 10);
  next();
});

// Compare PIN method
userSchema.methods.comparePin = async function (plainPin) {
  return bcrypt.compare(plainPin, this.pin);
};

const User = mongoose.model("User", userSchema);

export default User;
export { User };
