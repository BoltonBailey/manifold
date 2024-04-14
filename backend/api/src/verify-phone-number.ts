import { APIError, APIHandler } from 'api/helpers/endpoint'
import { log } from 'shared/log'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isProd } from 'shared/utils'
import * as admin from 'firebase-admin'
import { STARTING_BALANCE, SUS_STARTING_BALANCE } from 'common/economy'
import { PrivateUser, User } from 'common/user'
import { SignupBonusTxn } from 'common/txn'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { rateLimitByUser } from './helpers/rate-limit'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const twilio = require('twilio')

export const verifyPhoneNumber: APIHandler<'verify-phone-number'> =
  rateLimitByUser(async (props, auth) => {
    const pg = createSupabaseDirectClient()

    const { phoneNumber, code: otpCode } = props
    const userHasPhoneNumber = await pg.oneOrNone(
      `select phone_number from private_user_phone_numbers where user_id = $1
            or phone_number = $2
            limit 1
            `,
      [auth.uid, phoneNumber]
    )
    if (userHasPhoneNumber && isProd()) {
      throw new APIError(400, 'User verified phone number already.')
    }
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const client = new twilio(process.env.TWILIO_SID, authToken)
    const verification = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SID)
      .verificationChecks.create({ to: phoneNumber, code: otpCode })
    if (verification.status !== 'approved') {
      throw new APIError(400, 'Invalid code. Please try again.')
    }

    await pg
      .none(
        `insert into private_user_phone_numbers (user_id, phone_number) values ($1, $2)
            on conflict (user_id) do nothing `,
        [auth.uid, phoneNumber]
      )
      .catch((e) => {
        log(e)
        if (isProd()) throw new APIError(400, 'Phone number already exists')
      })
      .then(() => {
        log(verification.status, { phoneNumber, otpCode })
      })

    const firestore = admin.firestore()
    const privateUserSnap = await firestore
      .collection('private-users')
      .doc(auth.uid)
      .get()
    const privateUser = privateUserSnap.data() as PrivateUser
    const isPrivateUserWithMatchingDeviceToken = async (
      deviceToken: string
    ) => {
      const snap = await firestore
        .collection('private-users')
        .where('initialDeviceToken', '==', deviceToken)
        .where('id', '!=', auth.uid)
        .get()

      return !snap.empty
    }
    const { initialDeviceToken: deviceToken } = privateUser
    const deviceUsedBefore =
      !deviceToken || (await isPrivateUserWithMatchingDeviceToken(deviceToken))
    const amount = deviceUsedBefore ? SUS_STARTING_BALANCE : STARTING_BALANCE
    await firestore.runTransaction(async (transaction) => {
      const toDoc = firestore.doc(`users/${auth.uid}`)
      const toUserSnap = await transaction.get(toDoc)
      if (!toUserSnap.exists)
        throw new APIError(400, 'User not found', { userId: auth.uid })
      const user = toUserSnap.data() as User
      const { verifiedPhone } = user
      if (verifiedPhone === true || verifiedPhone === undefined)
        throw new APIError(400, 'User already verified')

      const signupBonusTxn: Omit<
        SignupBonusTxn,
        'fromId' | 'id' | 'createdTime'
      > = {
        fromType: 'BANK',
        amount: amount,
        category: 'SIGNUP_BONUS',
        toId: auth.uid,
        token: 'M$',
        toType: 'USER',
        description: 'Signup bonus for verifying phone number',
        data: {},
      }
      const manaBonusTxn = await runTxnFromBank(transaction, signupBonusTxn)
      if (manaBonusTxn.status != 'error' && manaBonusTxn.txn) {
        transaction.update(toDoc, {
          verifiedPhone: true,
        })
        log(`Sent phone verification bonus to user ${auth.uid}`)
      } else {
        log(
          `No phone verification bonus sent to user ${auth.uid}: ${manaBonusTxn.message}`
        )
        throw new APIError(400, 'Error sending phone verification bonus')
      }
    })

    return { status: 'success' }
  })
