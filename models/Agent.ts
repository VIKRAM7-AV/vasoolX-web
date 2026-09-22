import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAgentPayment {
  amount: number;
  date: Date;
  description?: string;
}

export interface IAgent extends Document {
  name: string;
  phone: string;
  address: string;
  commissionRate: number;
  amount?: number;
  GivenAmount: IAgentPayment[];
  createdAt: Date;
  updatedAt: Date;
}

const agentPaymentSchema = new Schema<IAgentPayment>(
  {
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    description: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const AgentSchema = new Schema<IAgent>(
  {
    name: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
    },
    address: {
      type: String,
      required: true,
    },
    commissionRate: {
      type: Number,
      required: true,
    },
    amount: {
      type: Number,
      default: 0,
    },
    GivenAmount: [agentPaymentSchema],
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production") {
  delete mongoose.models.Agent;
}

const Agent: Model<IAgent> =
  mongoose.models.Agent || mongoose.model<IAgent>("Agent", AgentSchema);

export default Agent;
