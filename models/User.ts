import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IUser extends Document {
  name: string;
  profile?: string;
  phone?: number;
  status: "active" | "inactive" | "missing";
  vasool: Types.ObjectId[];
  proof?: string;
  proofs?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
    },
    profile: {
      type: String,
    },
    phone: {
      type: Number,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "missing"],
      default: "active",
    },
    vasool: [
      {
        type: Schema.Types.ObjectId,
        ref: "Vasool",
        required: true,
      },
    ],
    proof: {
      type: String,
    },
    proofs: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

if (process.env.NODE_ENV !== "production") {
  delete mongoose.models.User;
}

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
