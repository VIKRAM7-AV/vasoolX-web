import bcrypt from "bcryptjs";
import Admin from "@/models/Admin";
import { signAccessToken, signRefreshToken, verifyToken } from "@/lib/jwt";
import connectDB from "@/lib/db";

export interface NewAdminInput {
  username?: string;
  email?: string;
  password?: string;
}

export interface LoginAdminInput {
  username?: string;
  password?: string;
}

export interface UpdatePasswordInput {
  currentPassword?: string;
  newPassword?: string;
}

export interface ForgetPasswordInput {
  username?: string;
  email?: string;
  newPassword?: string;
}

export async function createAdminService(input: NewAdminInput) {
  await connectDB();
  const { username, email, password } = input || {};

  const missing: string[] = [];
  if (!username) missing.push("username");
  if (!email) missing.push("email");
  if (!password) missing.push("password");

  if (missing.length) {
    return {
      status: 400,
      data: { message: `Missing required field(s): ${missing.join(", ")}` },
    };
  }

  const existingAdmin = await Admin.findOne({
    $or: [{ email }, { username }],
  });

  if (existingAdmin) {
    return {
      status: 400,
      data: { message: "Admin with this email or username already exists" },
    };
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password!, salt);
  const newAdmin = new Admin({ username, email, password: hashedPassword });
  await newAdmin.save();

  return {
    status: 201,
    data: { message: "New admin created successfully", data: newAdmin },
  };
}

export async function loginAdminService(input: LoginAdminInput) {
  await connectDB();
  const { username, password } = input || {};

  if (!username || !password) {
    return {
      status: 400,
      data: { message: "Username and password are required" },
    };
  }

  const existingAdmin = await Admin.findOne({ username });
  if (!existingAdmin) {
    return {
      status: 400,
      data: { message: "Invalid username or password" },
    };
  }

  const isPasswordValid = await bcrypt.compare(password, existingAdmin.password);
  if (!isPasswordValid) {
    return {
      status: 400,
      data: { message: "Invalid username or password" },
    };
  }

  const accessTokenAdmin = signAccessToken(existingAdmin._id);
  const refreshTokenAdmin = signRefreshToken(existingAdmin._id);

  return {
    status: 200,
    data: {
      success: true,
      message: "Login successful",
      admin: {
        id: existingAdmin._id,
        username: existingAdmin.username,
        email: existingAdmin.email,
      },
      accessTokenAdmin,
      refreshTokenAdmin,
    },
  };
}

export async function refreshTokenService(refreshToken?: string) {
  await connectDB();
  if (!refreshToken) {
    return { status: 400, data: { message: "Refresh token required" } };
  }

  let decoded;
  try {
    decoded = verifyToken(refreshToken);
  } catch {
    return {
      status: 401,
      data: { message: "Invalid or expired refresh token" },
    };
  }

  const admin = await Admin.findById(decoded.id);
  if (!admin) {
    return { status: 404, data: { message: "Admin not found" } };
  }

  const accessToken = signAccessToken(admin._id);
  return { status: 200, data: { accessToken } };
}

export async function getMeService(adminId: string) {
  await connectDB();
  const admin = await Admin.findById(adminId).select("-password");
  if (!admin) {
    return { status: 404, data: { message: "Admin not found" } };
  }
  return { status: 200, data: { admin } };
}

export async function updatePasswordService(
  adminId: string,
  input: UpdatePasswordInput
) {
  await connectDB();
  const { currentPassword, newPassword } = input || {};

  if (!currentPassword || !newPassword) {
    return {
      status: 400,
      data: { message: "Both currentPassword and newPassword are required" },
    };
  }

  if (newPassword.length < 6) {
    return {
      status: 400,
      data: { message: "New password must be at least 6 characters long" },
    };
  }

  const admin = await Admin.findById(adminId);
  if (!admin) {
    return { status: 404, data: { message: "Admin not found" } };
  }

  const isPasswordValid = await bcrypt.compare(currentPassword, admin.password);
  if (!isPasswordValid) {
    return { status: 400, data: { message: "Current password is incorrect" } };
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  admin.password = hashedPassword;
  await admin.save();

  return {
    status: 200,
    data: { message: "Password updated successfully" },
  };
}

export async function forgetPasswordService(input: ForgetPasswordInput) {
  await connectDB();
  const { username, email, newPassword } = input || {};

  if (!username || !email || !newPassword) {
    return {
      status: 400,
      data: {
        message: "Username, Email, and New Password are required",
      },
    };
  }

  if (newPassword.length < 6) {
    return {
      status: 400,
      data: { message: "New password must be at least 6 characters long" },
    };
  }

  const admin = await Admin.findOne({ username, email });
  if (!admin) {
    return {
      status: 404,
      data: {
        message:
          "Invalid credentials. Username and Email do not match any account.",
      },
    };
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  admin.password = hashedPassword;
  await admin.save();

  return {
    status: 200,
    data: { message: "Password has been reset successfully" },
  };
}

export async function adminAmountPaidService(
  adminId: string,
  paidAmount?: number
) {
  await connectDB();
  if (!paidAmount || typeof paidAmount !== "number" || paidAmount <= 0) {
    return {
      status: 400,
      data: {
        success: false,
        message: "Valid paidAmount is required and must be greater than 0",
      },
    };
  }

  const admin = await Admin.findById(adminId);
  if (!admin) {
    return {
      status: 404,
      data: { success: false, message: "Admin not found" },
    };
  }

  if (admin.balanceAmount < paidAmount) {
    return {
      status: 400,
      data: { success: false, message: "Insufficient admin balance" },
    };
  }

  const currentAmount = admin.currentAmount || 0;
  if (currentAmount < paidAmount) {
    return {
      status: 400,
      data: { success: false, message: "Insufficient agent balance" },
    };
  }

  admin.balanceAmount = (admin.balanceAmount || 0) - paidAmount;
  admin.receivedPayments.push({
    amount: paidAmount,
    date: new Date(),
  });
  admin.currentAmount = currentAmount - paidAmount;

  await admin.save();

  return {
    status: 200,
    data: {
      success: true,
      message: "Admin paid amount updated successfully",
      data: admin,
    },
  };
}
