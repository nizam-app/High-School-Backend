
import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    // Session Title (required)
    title: {
      type: String,
      required: [true, "Session title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },

    // Grade Level (required)
    grade: {
      type: String,
      required: [true, "Grade is required"],
      trim: true,
    },
    gradeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Grade",
      default: null,
    },

    // Subject (required)
    subject: {
      type: String,
      required: [true, "Subject is required"],
      trim: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null,
    },

    // Class Name (optional - for display purposes)
    className: {
      type: String,
      trim: true,
      maxlength: [100, "Class name cannot exceed 100 characters"],
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      default: null,
    },

    // Session Date (required)
    date: {
      type: Date,
      required: [true, "Date is required"],
      validate: {
        validator: function (date) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return date >= today;
        },
        message: "Date cannot be in the past",
      },
    },

    // Session Time (required)
    time: {
      type: String,
      required: [true, "Time is required"],
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (use HH:MM)"],
    },

    // Session Duration (in minutes)
    duration: {
      type: Number,
      default: 60,
      min: [15, "Duration must be at least 15 minutes"],
      max: [240, "Duration cannot exceed 240 minutes"],
    },

    // Zoom Meeting Link (required)
    zoomLink: {
      type: String,
      required: [true, "Zoom meeting link is required"],
      trim: true,
      validate: {
        validator: function (link) {
          return /^https?:\/\/.+/.test(link);
        },
        message: "Please provide a valid URL",
      },
    },

    // Meeting ID (optional - extracted from Zoom link)
    meetingId: {
      type: String,
      trim: true,
    },

    // Meeting Password (optional)
    meetingPassword: {
      type: String,
      trim: true,
    },

    // Teacher who created the session
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Session Status
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "ongoing", "completed", "cancelled"],
      default: "pending",
    },

    // Admin Approval
    approvalStatus: {
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      approvedAt: Date,
      rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      rejectedAt: Date,
      rejectionReason: {
        type: String,
        maxlength: [500, "Rejection reason cannot exceed 500 characters"],
      },
    },

    // Student Attendance
    attendance: [
      {
        student: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        status: {
          type: String,
          enum: ["present", "absent", "late"],
          default: "absent",
        },
        joinedAt: Date,
        leftAt: Date,
        duration: Number,
        markedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        markedAt: Date,
        notes: String,
      },
    ],

    // Recording URL
    recordingUrl: {
      type: String,
      trim: true,
    },

    startedAt: Date,
    endedAt: Date,

    // Session Notes
    notes: {
      type: String,
      maxlength: [2000, "Notes cannot exceed 2000 characters"],
    },

    // Attachments
    // attachments: [
    //   {
    //     filename: String,
    //     fileUrl: String,
    //     fileSize: Number,
    //     fileType: String,
    //     uploadedAt: {
    //       type: Date,
    //       default: Date.now,
    //     },
    //   },
    // ],

    // Notification flags
    notificationSent: {
      type: Boolean,
      default: false,
    },

    reminderSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
sessionSchema.index({ teacher: 1, status: 1, date: 1 });
sessionSchema.index({ status: 1, date: 1 });
sessionSchema.index({ grade: 1, subject: 1, date: 1 });

// Virtual: Check if session is upcoming
sessionSchema.virtual("isUpcoming").get(function () {
  const sessionDateTime = new Date(this.date);
  const [hours, minutes] = this.time.split(":").map(Number);
  sessionDateTime.setHours(hours, minutes, 0, 0);

  return sessionDateTime > new Date();
});

// Virtual: Check if session is ongoing
sessionSchema.virtual("isOngoing").get(function () {
  return this.status === "ongoing";
});

// Virtual: Attendance statistics
sessionSchema.virtual("attendanceStats").get(function () {
  if (!this.attendance || this.attendance.length === 0) {
    return { present: 0, absent: 0, late: 0, total: 0 };
  }

  const stats = {
    present: 0,
    absent: 0,
    late: 0,
    total: this.attendance.length,
  };

  this.attendance.forEach((record) => {
    stats[record.status]++;
  });

  return stats;
});

const Session = mongoose.model("Session", sessionSchema);

export default Session;
