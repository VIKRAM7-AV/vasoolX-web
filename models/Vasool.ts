import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ITransaction {
  amount: number;
  date: Date;
  createdAt: Date;
}

export interface IPayment {
  expectedAmount: number;
  amount: number;
  date: Date;
  status: "pending" | "partial" | "paid" | "due";
  note: string;
  transactions: ITransaction[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IVasool extends Document {
  userId: Types.ObjectId;
  pendingAmount: number;
  collectedAmount: number;
  agentId?: Types.ObjectId | null;
  amount: number;
  bookingType: "10 weeks" | "50 days" | "100 days";
  startingDate: Date;
  endingDate?: Date;
  status: "active" | "completed" | "missing" | "arrear";
  media?: string;
  payments: IPayment[];
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const paymentSchema = new Schema<IPayment>(
  {
    expectedAmount: { type: Number, default: 0 },
    amount: { type: Number, required: true, default: 0 },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "partial", "paid", "due"],
      default: "pending",
    },
    note: { type: String, default: "" },
    transactions: [transactionSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const VasoolSchema = new Schema<IVasool>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pendingAmount: { type: Number, default: 0 },
    collectedAmount: { type: Number, default: 0 },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "Agent",
      default: null,
    },
    amount: { type: Number, required: true },
    bookingType: {
      type: String,
      enum: ["10 weeks", "50 days", "100 days"],
      required: true,
    },
    startingDate: { type: Date, required: true },
    endingDate: { type: Date },
    status: {
      type: String,
      enum: ["active", "completed", "missing", "arrear"],
      default: "active",
    },
    media: {
      type: String,
      default: null,
    },
    payments: [paymentSchema],
  },
  { timestamps: true }
);

// Pre-save hook: auto-calculate endingDate
VasoolSchema.pre("save", function () {
  if (!this.isNew || !this.startingDate || this.endingDate) {
    return;
  }

  const start = new Date(this.startingDate);
  start.setHours(12, 0, 0, 0);

  const addDaysSkippingSundays = (startDate: Date, days: number): Date => {
    const date = new Date(startDate);
    let count = 0;

    while (count < days) {
      date.setDate(date.getDate() + 1);
      if (date.getDay() !== 0) count++;
    }
    return date;
  };

  switch (this.bookingType) {
    case "10 weeks": {
      const end = new Date(start);
      end.setDate(end.getDate() + 63);
      this.endingDate = end;
      break;
    }

    case "50 days": {
      this.endingDate = addDaysSkippingSundays(start, 50);
      break;
    }

    case "100 days": {
      this.endingDate = addDaysSkippingSundays(start, 100);
      break;
    }
  }
});

if (process.env.NODE_ENV !== "production") {
  delete mongoose.models.Vasool;
}

const Vasool: Model<IVasool> =
  mongoose.models.Vasool || mongoose.model<IVasool>("Vasool", VasoolSchema);

export default Vasool;
