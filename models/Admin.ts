import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAdminPayment {
  amount: number;
  date: Date;
}

export interface IAdmin extends Document {
  username: string;
  email: string;
  password: string;
  currentAmount: number;
  balanceAmount: number;
  inverstAmount: number;
  receivedPayments: IAdminPayment[];
  createdAt: Date;
  updatedAt: Date;
}

const adminPaymentSchema = new Schema<IAdminPayment>(
  {
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AdminSchema = new Schema<IAdmin>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    currentAmount: {
      type: Number,
      default: 0,
    },
    balanceAmount: {
      type: Number,
      default: 0,
    },
    inverstAmount: {
      type: Number,
      default: 0,
    },
    receivedPayments: [adminPaymentSchema],
  },
  { timestamps: true }
);

const Admin: Model<IAdmin> =
  mongoose.models.Admin || mongoose.model<IAdmin>("Admin", AdminSchema);

export default Admin;
