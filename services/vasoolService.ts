import connectDB from "@/lib/db";
import User from "@/models/User";
import Agent from "@/models/Agent";
import Vasool, { IPayment } from "@/models/Vasool";
import Admin from "@/models/Admin";
import {
  uploadBufferToCloudinary,
  getPublicIdFromUrl,
  deleteFromCloudinary,
} from "@/lib/cloudinary";

// =========================================================
// VASOOL STATUS SYNCHRONIZATION
// =========================================================
export const syncAllVasoolStatuses = async (): Promise<void> => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // 1. Completed
    await Vasool.updateMany(
      {
        status: { $ne: "completed" },
        pendingAmount: { $lte: 0 },
        $expr: { $gte: ["$collectedAmount", "$amount"] },
      },
      { $set: { status: "completed" } }
    );

    // 2. Erroneous Arrears -> Active
    await Vasool.updateMany(
      {
        status: "arrear",
        endingDate: { $gte: startOfToday },
      },
      { $set: { status: "active" } }
    );

    // 3. Expired Active -> Arrear
    await Vasool.updateMany(
      {
        status: "active",
        endingDate: { $lt: startOfToday },
        pendingAmount: { $gt: 0 },
      },
      { $set: { status: "arrear" } }
    );
  } catch (error) {
    console.error("Error syncing vasool statuses:", error);
  }
};

// =========================================================
// REUSABLE PAYMENT & COMMISSION HELPERS
// =========================================================
export const calculateInstallmentAmount = (
  vasool: { amount?: number; bookingType?: string } | null
): number => {
  if (!vasool || !vasool.amount) return 0;
  if (vasool.bookingType === "10 weeks") return vasool.amount / 10;
  if (vasool.bookingType === "50 days") return vasool.amount / 50;
  if (vasool.bookingType === "100 days") return vasool.amount / 100;
  return 0;
};

export const findPaymentForDate = (
  payments: IPayment[] | undefined,
  targetDate: Date
): number => {
  if (!payments || !Array.isArray(payments)) return -1;
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  return payments.findIndex((p) => {
    const pDate = new Date(p.date);
    pDate.setHours(0, 0, 0, 0);
    return (
      pDate.getTime() === target.getTime() &&
      ["partial", "due", "pending"].includes(p.status)
    );
  });
};

export const processPaymentCommissionAndBalance = async (
  amountReceived: number,
  agentId?: unknown
) => {
  if (!amountReceived || amountReceived <= 0) {
    return { agentShare: 0, adminShare: 0, totalInterest: 0 };
  }

  // 1. Update Admin Balance (Cash Flow)
  const admin = await Admin.findOne();
  if (admin) {
    admin.balanceAmount = (admin.balanceAmount || 0) + amountReceived;
  }

  // 2. Calculate 20% interest on the paid amount
  const totalInterest = amountReceived * 0.2;
  let agentShare = 0;
  let adminShare = totalInterest;

  // 3. Calculate Agent and Admin share
  if (agentId) {
    const agent = await Agent.findById(agentId);
    if (agent && agent.commissionRate > 0) {
      agentShare = amountReceived * (agent.commissionRate / 100);
      if (agentShare > totalInterest) {
        agentShare = totalInterest;
      }
      agent.amount = (agent.amount || 0) + agentShare;
      await agent.save();
      adminShare = totalInterest - agentShare;
    }
  }

  if (adminShare < 0) adminShare = 0;

  // 4. Update Admin currentAmount (wallet)
  if (admin) {
    admin.currentAmount = (admin.currentAmount || 0) + adminShare;
    await admin.save();
  }

  return { agentShare, adminShare, totalInterest };
};

export const evaluateVasoolStatus = (
  vasool: { endingDate?: Date; collectedAmount: number; amount: number; pendingAmount: number },
  referenceDate = new Date()
) => {
  const startOfRef = new Date(referenceDate);
  startOfRef.setHours(0, 0, 0, 0);

  const endingDate = new Date(vasool.endingDate || new Date());
  const startOfEnding = new Date(endingDate);
  startOfEnding.setHours(0, 0, 0, 0);

  const isFullyPaid =
    vasool.collectedAmount >= vasool.amount && vasool.pendingAmount <= 0;
  const isEndDateEnded = startOfEnding.getTime() < startOfRef.getTime();
  const isLastDay = startOfEnding.getTime() <= startOfRef.getTime();

  let finalStatus: "active" | "completed" | "arrear" = "active";

  if (isFullyPaid) {
    finalStatus = "completed";
  } else if (isEndDateEnded && vasool.pendingAmount > 0) {
    finalStatus = "arrear";
  } else {
    finalStatus = "active";
  }

  return { finalStatus, isEndDateEnded, isFullyPaid, isLastDay };
};

// =========================================================
// USER SERVICES
// =========================================================
export async function createUserService(params: {
  name?: string;
  phone?: string | number;
  profileBuffer?: Buffer | null;
  proofBuffers?: Buffer[];
  proof1Buffer?: Buffer | null;
}) {
  await connectDB();
  const { name, phone: phoneInput, profileBuffer } = params;

  const phone =
    phoneInput !== undefined ? Number(String(phoneInput).trim()) : NaN;

  const missing: string[] = [];
  if (!name || !name.trim()) missing.push("name");

  if (missing.length > 0) {
    return {
      status: 400,
      data: { error: "Missing or invalid fields", missing },
    };
  }

  const proofBuffers =
    params.proofBuffers ??
    (params.proof1Buffer && params.proof1Buffer.length > 0
      ? [params.proof1Buffer]
      : []);

  if (proofBuffers.length > 5) {
    return {
      status: 400,
      data: {
        message: "Maximum 5 proof attachments are allowed",
      },
    };
  }

  let profileValue: string | null = null;
  if (profileBuffer && profileBuffer.length > 0) {
    try {
      const uploadRes = await uploadBufferToCloudinary(profileBuffer, {
        folder: "users/profiles",
        resource_type: "image",
        transformation: [
          { width: 500, height: 500, crop: "limit", quality: "auto" },
        ],
      });
      profileValue = uploadRes.secure_url;
    } catch (err) {
      console.error("Profile upload failed:", err);
    }
  }

  const proofValues: string[] = [];
  for (const proofBuffer of proofBuffers) {
    if (!proofBuffer || proofBuffer.length === 0) continue;

    try {
      const uploadRes = await uploadBufferToCloudinary(proofBuffer, {
        folder: "users/proofs",
        resource_type: "image",
        transformation: [
          {
            width: 800,
            height: 600,
            crop: "limit",
            quality: "auto",
          },
        ],
      });

      proofValues.push(uploadRes.secure_url);
    } catch (err) {
      console.error("Proof upload failed:", err);
    }
  }

  const newUser = new User({
    name: name!.trim(),
    phone,
    vasool: [],
    ...(profileValue && { profile: profileValue }),
    proofs: proofValues,
    ...(proofValues.length > 0 && { proof: proofValues[0] }),
  });

  const savedUser = await newUser.save();

  return {
    status: 201,
    data: {
      message: "New user created successfully",
      data: savedUser,
      userId: savedUser._id,
    },
  };
}

export async function updateUserService(
  id: string,
  params: {
    name?: string;
    phone?: string | number;
    profileBuffer?: Buffer | null;
    proofBuffers?: Buffer[];
    proof1Buffer?: Buffer | null;
  }
) {
  await connectDB();
  const user = await User.findById(id);
  if (!user) {
    return { status: 404, data: { message: "User not found" } };
  }

  const updateData: Record<string, unknown> = {};

  if (params.name) {
    updateData.name = params.name.trim();
  }

  if (params.phone !== undefined && params.phone !== "") {
    const phoneNum = Number(String(params.phone).trim());
    if (Number.isNaN(phoneNum)) {
      return { status: 400, data: { error: "Invalid phone format" } };
    }

    const existing = await User.findOne({ phone: phoneNum, _id: { $ne: id } });
    if (existing) {
      return { status: 400, data: { message: "Phone number already in use" } };
    }
    updateData.phone = phoneNum;
  }

  if (params.profileBuffer && params.profileBuffer.length > 0) {
    try {
      const result = await uploadBufferToCloudinary(params.profileBuffer, {
        folder: "users/profiles",
        transformation: [{ width: 500, height: 500, crop: "limit" }],
      });
      updateData.profile = result.secure_url;
    } catch (err) {
      console.error("Cloudinary profile update failed:", err);
    }
  }

  const newProofBuffers =
    params.proofBuffers ??
    (params.proof1Buffer && params.proof1Buffer.length > 0
      ? [params.proof1Buffer]
      : undefined);

  if (newProofBuffers !== undefined) {
    if (newProofBuffers.length > 5) {
      return {
        status: 400,
        data: {
          message: "Maximum 5 proof attachments are allowed",
        },
      };
    }

    // 1 & 2. Find existing proofs and delete old Cloudinary proof files
    const deletePromises: Promise<unknown>[] = [];
    if (user.proof) {
      const pubId = getPublicIdFromUrl(user.proof);
      if (pubId) deletePromises.push(deleteFromCloudinary(pubId));
    }
    if (user.proofs && user.proofs.length > 0) {
      for (const proofUrl of user.proofs) {
        if (user.proof && proofUrl === user.proof) continue;
        const pubId = getPublicIdFromUrl(proofUrl);
        if (pubId) deletePromises.push(deleteFromCloudinary(pubId));
      }
    }
    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }

    // 3. Upload new proofs
    const proofValues: string[] = [];
    for (const proofBuffer of newProofBuffers) {
      if (!proofBuffer || proofBuffer.length === 0) continue;

      try {
        const uploadRes = await uploadBufferToCloudinary(proofBuffer, {
          folder: "users/proofs",
          resource_type: "image",
          transformation: [
            {
              width: 800,
              height: 600,
              crop: "limit",
              quality: "auto",
            },
          ],
        });
        proofValues.push(uploadRes.secure_url);
      } catch (err) {
        console.error("Proof upload failed:", err);
      }
    }

    // 4. Save the new URLs
    updateData.proofs = proofValues;
    updateData.proof = proofValues[0] || null;
  }

  const updatedUser = await User.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true }
  );

  return {
    status: 200,
    data: {
      message: "User updated successfully",
      data: updatedUser,
    },
  };
}

export async function getAllUsersService() {
  await connectDB();
  const users = await User.find().populate({
    path: "vasool",
    populate: { path: "agentId", model: "Agent" },
  });
  return { status: 200, data: { data: users } };
}

export async function deleteUserService(id: string) {
  await connectDB();
  const user = await User.findById(id);
  if (!user) {
    return {
      status: 404,
      data: { success: false, message: "User not found" },
    };
  }

  const deletePromises: Promise<unknown>[] = [];

  if (user.profile) {
    const pubId = getPublicIdFromUrl(user.profile);
    if (pubId) deletePromises.push(deleteFromCloudinary(pubId));
  }

  if (user.proof) {
    const pubId = getPublicIdFromUrl(user.proof);
    if (pubId) deletePromises.push(deleteFromCloudinary(pubId));
  }

  if (user.proofs && user.proofs.length > 0) {
    for (const proofUrl of user.proofs) {
      if (user.proof && proofUrl === user.proof) continue;
      const pubId = getPublicIdFromUrl(proofUrl);
      if (pubId) {
        deletePromises.push(deleteFromCloudinary(pubId));
      }
    }
  }

  if (deletePromises.length > 0) {
    await Promise.all(deletePromises);
  }

  await Vasool.deleteMany({ userId: id });
  await User.findByIdAndDelete(id);

  return {
    status: 200,
    data: {
      success: true,
      message: "User, related Vasools, and associated images deleted successfully.",
    },
  };
}

// =========================================================
// AGENT SERVICES
// =========================================================
export async function newAgentService(body: {
  name?: string;
  phone?: string;
  address?: string;
  commissionRate?: number;
}) {
  await connectDB();
  const { name, phone, address, commissionRate } = body || {};

  if (!name || !phone || !address || commissionRate === undefined) {
    return {
      status: 400,
      data: { message: "Name, phone, address, and commissionRate are required" },
    };
  }

  const existingAgent = await Agent.findOne({ phone });
  if (existingAgent) {
    return {
      status: 400,
      data: { message: "Agent with this phone number already exists" },
    };
  }

  const newAgentDoc = new Agent({
    name,
    phone,
    address,
    commissionRate,
    amount: 0,
    GivenAmount: [],
  });

  const savedAgent = await newAgentDoc.save();
  return {
    status: 200,
    data: {
      message: "New agent created successfully",
      data: savedAgent,
    },
  };
}

export async function allAgentService() {
  await connectDB();
  const agents = await Agent.find();
  return { status: 200, data: { data: agents } };
}

export async function updateAgentService(
  agentId: string,
  body: {
    name?: string;
    phone?: string;
    address?: string;
    commissionRate?: number;
  }
) {
  await connectDB();
  const { name, phone, address, commissionRate } = body || {};

  const agent = await Agent.findById(agentId);
  if (!agent) {
    return { status: 404, data: { message: "Agent not found" } };
  }

  if (phone && phone !== agent.phone) {
    const existingAgent = await Agent.findOne({ phone, _id: { $ne: agentId } });
    if (existingAgent) {
      return {
        status: 400,
        data: { message: "Phone number already in use by another agent" },
      };
    }
  }

  if (name) agent.name = name;
  if (phone) agent.phone = phone;
  if (address) agent.address = address;
  if (commissionRate !== undefined) agent.commissionRate = commissionRate;

  const updatedAgent = await agent.save();

  return {
    status: 200,
    data: {
      message: "Agent updated successfully",
      data: updatedAgent,
    },
  };
}

export async function agentAmountPaidService(
  agentId: string,
  paidAmount?: number,
  description?: string
) {
  await connectDB();
  console.log("Agent Payment Payload:", {
    agentId,
    paidAmount,
    description,
    paidAmountType: typeof paidAmount,
  });

  if (!paidAmount || typeof paidAmount !== "number" || paidAmount <= 0) {
    return {
      status: 400,
      data: {
        success: false,
        message: "Valid paidAmount is required and must be greater than 0",
      },
    };
  }
  
  const agent = await Agent.findById(agentId);
  if (!agent) {
    return {
      status: 404,
      data: { success: false, message: "Agent not found" },
    };
  }

  const admin = await Admin.findOne();
  if (!admin) {
    return {
      status: 500,
      data: { success: false, message: "Admin account not initialized" },
    };
  }
  
  console.log("=== AGENT PAYMENT DEBUG ===");
  console.log("Paid Amount:", paidAmount);
  console.log("Description:", description);
  console.log("Admin Balance:", admin.balanceAmount);
  console.log("Agent Balance:", agent.amount);
  
  const adminBalance = admin.balanceAmount || 0;
  if (adminBalance < paidAmount) {
    return {
      status: 400,
      data: { success: false, message: "Insufficient admin balance" },
    };
  }

  // Deduct admin balance only after all validations have passed
  admin.balanceAmount = adminBalance - paidAmount;
  await admin.save();

  if (!agent.GivenAmount) {
    agent.GivenAmount = [];
  }

  agent.GivenAmount.push({
    amount: paidAmount,
    date: new Date(),
    description: description?.trim() || "",
  });

  // Safely update agent amount without allowing negative balance
  const currentAmount = agent.amount || 0;
  agent.amount = Math.max(0, currentAmount - paidAmount);

  await agent.save();

  return {
    status: 200,
    data: {
      success: true,
      message: "Agent paid amount updated successfully",
      data: agent,
    },
  };
}

// =========================================================
// VASOOL / BOOKING SERVICES
// =========================================================
export async function bookingVasoolService(body: {
  userId?: string;
  agentId?: string;
  amount?: number;
  startingDate?: string;
  bookingType?: "10 weeks" | "50 days" | "100 days";
  mediaBuffer?: Buffer | null;
}) {
  await connectDB();
  const { userId, agentId, amount, startingDate, bookingType, mediaBuffer } = body || {};

  const user = await User.findById(userId);
  if (!user) {
    return { status: 404, data: { message: "User not found" } };
  }

  const validBookingTypes = ["10 weeks", "50 days", "100 days"];
  if (!bookingType || !validBookingTypes.includes(bookingType)) {
    return {
      status: 400,
      data: {
        message: "Invalid bookingType. Must be '10 weeks', '50 days', or '100 days'",
      },
    };
  }

  if (!amount || typeof amount !== "number" || amount <= 0) {
    return {
      status: 400,
      data: { message: "Valid positive amount is required" },
    };
  }

  // Reduce Admin Balance (80% of Loan Amount)
  const disbursementAmount = amount * 0.8;

  const admin = await Admin.findOne();
  if (!admin) {
    return {
      status: 500,
      data: { message: "Admin account not initialized" },
    };
  }

  const currentBalance = admin.balanceAmount || 0;
  if (currentBalance < disbursementAmount) {
    return {
      status: 400,
      data: { message: "Insufficient admin balance for disbursement" },
    };
  }

  // Upload media to Cloudinary if provided (before deducting balance or creating Vasool)
  let mediaValue: string | null = null;

  if (mediaBuffer && mediaBuffer.length > 0) {
    try {
      const uploadRes = await uploadBufferToCloudinary(mediaBuffer, {
        folder: "vasools/media",
        resource_type: "image",
        transformation: [
          {
            width: 1200,
            height: 1200,
            crop: "limit",
            quality: "auto",
          },
        ],
      });

      mediaValue = uploadRes.secure_url;
    } catch (error) {
      console.error("Vasool media upload failed:", error);

      return {
        status: 500,
        data: {
          message: "Failed to upload Vasool media",
        },
      };
    }
  }

  admin.balanceAmount = currentBalance - disbursementAmount;
  await admin.save();

  const newVasool = new Vasool({
    userId,
    amount,
    startingDate: new Date(startingDate || Date.now()),
    bookingType,
    pendingAmount: 0,
    collectedAmount: 0,
    status: "active",
    ...(agentId && { agentId }),
    ...(mediaValue && { media: mediaValue }),
  });

  const savedVasool = await newVasool.save();

  user.vasool.push(savedVasool._id);
  await user.save();

  return {
    status: 200,
    data: {
      message: "Vasool booked successfully",
      data: savedVasool,
      adminDeduction: disbursementAmount,
    },
  };
}

export async function allVasoolService() {
  await connectDB();
  await syncAllVasoolStatuses();
  const vasools = await Vasool.find({ status: "active" })
    .populate("userId")
    .populate("agentId");
  return { status: 200, data: { data: vasools } };
}

export async function arrearVasoolService() {
  await connectDB();
  await syncAllVasoolStatuses();
  const vasools = await Vasool.find({ status: "arrear" })
    .populate("userId")
    .populate("agentId");
  return { status: 200, data: { data: vasools } };
}

export async function allVasoolsService() {
  await connectDB();
  await syncAllVasoolStatuses();
  const vasools = await Vasool.find()
    .populate("userId")
    .populate("agentId");
  return { status: 200, data: { data: vasools } };
}

export async function expectAmountService() {
  await connectDB();
  await syncAllVasoolStatuses();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const dayIndex = startOfToday.getDay();
  const isSaturday = dayIndex === 6;
  const isSunday = dayIndex === 0;

  if (isSunday) {
    return {
      status: 200,
      data: { totalExpectedAmount: 0, message: "No collection on Sundays" },
    };
  }

  const bookings = await Vasool.find({
    status: "active",
    startingDate: { $lte: endOfToday },
    endingDate: { $gte: startOfToday },
  });

  let totalExpectedAmount = 0;

  for (const booking of bookings) {
    if (booking.bookingType === "50 days") {
      totalExpectedAmount += booking.amount / 50;
    } else if (booking.bookingType === "100 days") {
      totalExpectedAmount += booking.amount / 100;
    } else if (booking.bookingType === "10 weeks" && isSaturday) {
      totalExpectedAmount += booking.amount / 10;
    }
  }

  return {
    status: 200,
    data: {
      success: true,
      totalExpectedAmount: Math.round(totalExpectedAmount),
      isSaturday,
      activeCount: bookings.length,
    },
  };
}

export async function getWealthProjectionService() {
  await connectDB();
  await syncAllVasoolStatuses();

  const [
    adminData,
    activePendingAgg,
    arrearPendingAgg,
    agentAmountAgg,
    companyWealthAgg,
  ] = await Promise.all([
    Admin.findOne({}, "currentAmount balanceAmount inverstAmount"),
    Vasool.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: null, total: { $sum: "$pendingAmount" } } },
    ]),
    Vasool.aggregate([
      { $match: { status: "arrear" } },
      { $group: { _id: null, total: { $sum: "$pendingAmount" } } },
    ]),
    Agent.aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]),
    Vasool.aggregate([
      { $match: { status: "active" } },
      {
        $project: {
          outstandingPrincipal: {
            $subtract: ["$amount", "$collectedAmount"],
          },
        },
      },
      { $group: { _id: null, total: { $sum: "$outstandingPrincipal" } } },
    ]),
  ]);

  const adminCurrentAmount = adminData ? adminData.currentAmount : 0;
  const activePendingSum =
    activePendingAgg.length > 0 ? activePendingAgg[0].total : 0;
  const arrearPendingSum =
    arrearPendingAgg.length > 0 ? arrearPendingAgg[0].total : 0;
  const allAgentSum = agentAmountAgg.length > 0 ? agentAmountAgg[0].total : 0;
  const companyWealth =
    companyWealthAgg.length > 0 ? companyWealthAgg[0].total : 0;
  const adminBalanceAmount = adminData ? adminData.balanceAmount : 0;
  const adminInvestmentAmount = adminData ? adminData.inverstAmount : 0;

  return {
    status: 200,
    data: {
      success: true,
      data: {
        adminCurrentAmount,
        activePendingSum,
        arrearPendingSum,
        allAgentSum,
        companyWealth: Math.round(companyWealth),
        adminBalanceAmount,
        adminInvestmentAmount,
      },
    },
  };
}

// =========================================================
// PAYMENT PROCESSING SERVICES
// =========================================================
export async function vasoolPaymentService(
  vasoolId: string,
  body: {
    amount?: number;
    status?: "paid" | "partial" | "due";
    date?: string | Date;
  }
) {
  await connectDB();
  const { amount, status, date } = body || {};

  if (status && !["paid", "partial", "due"].includes(status)) {
    return {
      status: 400,
      data: { message: 'Status must be "paid", "partial", or "due"' },
    };
  }

  const isDueAction = status === "due";

  if (!isDueAction) {
    if (
      amount === undefined ||
      amount === null ||
      typeof amount !== "number" ||
      isNaN(amount) ||
      amount <= 0
    ) {
      return {
        status: 400,
        data: { message: "Valid positive payment amount required" },
      };
    }
  }

  const inputDate = date ? new Date(date) : new Date();
  if (isNaN(inputDate.getTime())) {
    return { status: 400, data: { message: "Invalid date format" } };
  }
  const compareDate = new Date(inputDate);
  compareDate.setHours(0, 0, 0, 0);

  const vasool = await Vasool.findById(vasoolId).populate("userId");
  if (!vasool) {
    return { status: 404, data: { message: "Vasool not found" } };
  }

  const installmentAmount = calculateInstallmentAmount(vasool);
  if (installmentAmount <= 0) {
    return {
      status: 400,
      data: { message: "Invalid installment calculation for this booking" },
    };
  }

  const existingIndex = findPaymentForDate(vasool.payments, compareDate);
  const settledIndex = vasool.payments.findIndex((p) => {
    const pDate = new Date(p.date);
    pDate.setHours(0, 0, 0, 0);
    return pDate.getTime() === compareDate.getTime() && p.status === "paid";
  });

  let note = "";
  let recordedAmount = 0;
  let paymentResultStatus = status || "paid";

  // SCENARIO 1: ACTION IS "DUE"
  if (isDueAction) {
    if (settledIndex !== -1) {
      return {
        status: 400,
        data: { message: "Cannot mark as due; installment for this date is already paid" },
      };
    }

    if (existingIndex !== -1) {
      const existing = vasool.payments[existingIndex];
      if (existing.status === "partial") {
        return {
          status: 400,
          data: {
            message: "Cannot mark as due; partial payment has already been collected for this date",
          },
        };
      }
      if (existing.status === "due") {
        return {
          status: 200,
          data: {
            message: "Installment already marked as due",
            data: {
              type: "due",
              paymentStatus: "due",
              recordedAmount: 0,
              newPending: vasool.pendingAmount,
              vasoolStatus: vasool.status,
              note: existing.note || "Already marked as Due",
            },
          },
        };
      }

      existing.status = "due";
      existing.expectedAmount = existing.expectedAmount || installmentAmount;
      existing.amount = 0;
      existing.updatedAt = new Date();
      existing.note = "Marked as Due";
      vasool.pendingAmount += existing.expectedAmount || installmentAmount;
    } else {
      vasool.payments.push({
        expectedAmount: installmentAmount,
        amount: 0,
        date: inputDate,
        status: "due",
        note: "Marked as Due",
        transactions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vasool.pendingAmount += installmentAmount;
    }

    recordedAmount = 0;
    paymentResultStatus = "due";
    note = "Marked as Due";
  } else {
    // SCENARIO 2: PAYMENT RECEIVED (amount > 0)
    if (settledIndex !== -1) {
      return {
        status: 400,
        data: { message: "Installment for this date is already fully paid" },
      };
    }

    const payAmount = amount!;
    recordedAmount = payAmount;

    if (existingIndex !== -1) {
      const existing = vasool.payments[existingIndex];
      const previousStatus = existing.status;

      if (!existing.expectedAmount) {
        existing.expectedAmount = installmentAmount;
      }
      if (!existing.transactions) {
        existing.transactions = [];
      }

      const expected = existing.expectedAmount;
      const alreadyPaid = existing.amount || 0;
      const remainingForInstallment = Math.max(0, expected - alreadyPaid);

      const appliedToInstallment = Math.min(payAmount, remainingForInstallment);
      const extra = payAmount - appliedToInstallment;
      const newTotalPaid = alreadyPaid + appliedToInstallment;

      const isPaidInFull = newTotalPaid >= expected;
      paymentResultStatus = isPaidInFull ? "paid" : "partial";

      existing.amount = newTotalPaid;
      existing.status = paymentResultStatus;
      existing.updatedAt = new Date();
      existing.transactions.push({
        amount: payAmount,
        date: inputDate,
        createdAt: new Date(),
      });

      if (isPaidInFull) {
        note = extra > 0 ? "Installment paid full + excess applied" : "Installment paid successfully";
      } else {
        note = "Partial payment received";
      }
      existing.note = note;

      if (previousStatus === "pending") {
        const shortfall = expected - newTotalPaid;
        vasool.pendingAmount += shortfall;
      } else {
        vasool.pendingAmount -= appliedToInstallment;
      }

      if (extra > 0 && vasool.pendingAmount > 0) {
        const reduceBy = Math.min(extra, vasool.pendingAmount);
        vasool.pendingAmount -= reduceBy;
      }

      vasool.collectedAmount += payAmount;
    } else {
      const expected = installmentAmount;
      const appliedToInstallment = Math.min(payAmount, expected);
      const extra = payAmount - appliedToInstallment;
      const newTotalPaid = appliedToInstallment;

      const isPaidInFull = newTotalPaid >= expected;
      paymentResultStatus = isPaidInFull ? "paid" : "partial";

      if (isPaidInFull) {
        note = extra > 0 ? "Paid full + reduced old pending" : "Installment paid successfully";
      } else {
        note = "Partial payment - Shortfall added";
      }

      vasool.payments.push({
        expectedAmount: expected,
        amount: newTotalPaid,
        date: inputDate,
        status: paymentResultStatus,
        note,
        transactions: [
          {
            amount: payAmount,
            date: inputDate,
            createdAt: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      if (paymentResultStatus === "partial") {
        const shortfall = expected - appliedToInstallment;
        vasool.pendingAmount += shortfall;
      } else if (isPaidInFull && extra > 0 && vasool.pendingAmount > 0) {
        const reduceBy = Math.min(extra, vasool.pendingAmount);
        vasool.pendingAmount -= reduceBy;
      }

      vasool.collectedAmount += payAmount;
    }

    vasool.pendingAmount = Math.max(0, vasool.pendingAmount);

    await processPaymentCommissionAndBalance(payAmount, vasool.agentId);
  }

  const endingDateOnly = new Date(vasool.endingDate || new Date());
  endingDateOnly.setHours(0, 0, 0, 0);
  const isLastDay = compareDate.getTime() >= endingDateOnly.getTime();

  const { finalStatus } = evaluateVasoolStatus(vasool, new Date());
  vasool.status = finalStatus;

  const updatedVasool = await vasool.save();

  return {
    status: 200,
    data: {
      message: "Vasool entry updated successfully",
      data: {
        type: paymentResultStatus,
        paymentStatus: paymentResultStatus,
        recordedAmount,
        newPending: updatedVasool.pendingAmount,
        vasoolStatus: finalStatus,
        isLastDay,
        note,
      },
    },
  };
}

export async function arrearPaymentService(
  vasoolId: string,
  body: {
    amount?: number;
    status?: string;
    date?: string | Date;
    expectedAmount?: number;
  }
) {
  await connectDB();
  const { amount, date, expectedAmount: reqExpectedAmount } = body || {};

  if (
    amount === undefined ||
    amount === null ||
    typeof amount !== "number" ||
    isNaN(amount) ||
    amount <= 0
  ) {
    return {
      status: 400,
      data: { message: "Valid positive payment amount required" },
    };
  }

  const vasool = await Vasool.findById(vasoolId).populate("userId");
  if (!vasool) {
    return { status: 404, data: { message: "Vasool not found" } };
  }

  if (vasool.status !== "arrear") {
    return {
      status: 400,
      data: { message: "Vasool is not in arrear status" },
    };
  }

  if (amount > vasool.pendingAmount) {
    return {
      status: 400,
      data: {
        message: `Payment amount (${amount}) exceeds pending arrear amount (${vasool.pendingAmount})`,
      },
    };
  }

  const inputDate = date ? new Date(date) : new Date();
  if (isNaN(inputDate.getTime())) {
    return { status: 400, data: { message: "Invalid date format" } };
  }
  const compareDate = new Date(inputDate);
  compareDate.setHours(0, 0, 0, 0);

  let existingIndex = findPaymentForDate(vasool.payments, compareDate);
  if (existingIndex === -1 && !date) {
    existingIndex = vasool.payments.findIndex((p) =>
      ["partial", "due"].includes(p.status)
    );
  }

  let note = "";
  let paymentResultStatus: "paid" | "partial" = "partial";
  const currentPendingBeforePayment = vasool.pendingAmount;

  if (existingIndex !== -1) {
    const existing = vasool.payments[existingIndex];
    if (!existing.transactions) {
      existing.transactions = [];
    }

    const expected =
      existing.expectedAmount || reqExpectedAmount || currentPendingBeforePayment;
    existing.expectedAmount = expected;

    const alreadyPaid = existing.amount || 0;
    const newTotalPaid = alreadyPaid + amount;

    const isPaidInFull =
      newTotalPaid >= expected || currentPendingBeforePayment - amount === 0;
    paymentResultStatus = isPaidInFull ? "paid" : "partial";

    existing.amount = newTotalPaid;
    existing.status = paymentResultStatus;
    existing.updatedAt = new Date();
    existing.transactions.push({
      amount: amount,
      date: inputDate,
      createdAt: new Date(),
    });

    note = isPaidInFull ? "Arrear payment completed" : "Arrear partial payment received";
    existing.note = note;
  } else {
    const expected = reqExpectedAmount || currentPendingBeforePayment;
    const isPaidInFull =
      amount >= expected || currentPendingBeforePayment - amount === 0;
    paymentResultStatus = isPaidInFull ? "paid" : "partial";

    note = isPaidInFull ? "Arrear payment completed" : "Arrear partial payment received";

    vasool.payments.push({
      expectedAmount: expected,
      amount: amount,
      status: paymentResultStatus,
      date: inputDate,
      note,
      transactions: [
        {
          amount: amount,
          date: inputDate,
          createdAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const newPending = Math.max(0, currentPendingBeforePayment - amount);
  vasool.pendingAmount = newPending;
  vasool.collectedAmount += amount;

  await processPaymentCommissionAndBalance(amount, vasool.agentId);

  let finalStatus: "arrear" | "completed" = "arrear";
  if (newPending === 0 && vasool.collectedAmount >= vasool.amount) {
    finalStatus = "completed";
    note = "Arrear cleared - Loan Completed";
  }

  vasool.status = finalStatus;
  const updatedVasool = await vasool.save();

  return {
    status: 200,
    data: {
      message: "Arrear payment successful",
      data: {
        type: paymentResultStatus,
        paymentStatus: paymentResultStatus,
        amountRecorded: amount,
        collectedToday: amount,
        newPendingAmount: updatedVasool.pendingAmount,
        vasoolStatus: finalStatus,
        note,
        totalCollected: updatedVasool.collectedAmount,
      },
    },
  };
}
