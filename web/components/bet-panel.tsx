import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import { partition, sum, sumBy } from 'lodash'

import { useUser } from 'web/hooks/use-user'
import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'
import {
  formatMoney,
  formatMoneyWithDecimals,
  formatPercent,
  formatWithCommas,
} from 'common/util/format'
import { getBinaryBetStats, getBinaryCpmmBetInfo } from 'common/new-bet'
import { User } from 'web/lib/firebase/users'
import { Bet, LimitBet } from 'common/bet'
import { APIError, placeBet } from 'web/lib/firebase/api'
import { sellShares } from 'web/lib/firebase/api'
import { AmountInput, BuyAmountInput } from './amount-input'
import { InfoTooltip } from './info-tooltip'
import { BinaryOutcomeLabel, HigherLabel, LowerLabel } from './outcome-label'
import { getProbability } from 'common/calculate'
import { useFocus } from 'web/hooks/use-focus'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { calculateCpmmSale, getCpmmProbability } from 'common/calculate-cpmm'
import { getFormattedMappedValue, getMappedValue } from 'common/pseudo-numeric'
import { SellRow } from './sell-row'
import { useSaveBinaryShares } from './use-save-binary-shares'
import { SignUpPrompt } from './sign-up-prompt'
import { isIOS } from 'web/lib/util/device'
import { ProbabilityOrNumericInput } from './probability-input'
import { track } from 'web/lib/service/analytics'
import { useUnfilledBets } from 'web/hooks/use-bets'
import { LimitBets } from './limit-bets'
import { PillButton } from './buttons/pill-button'
import { YesNoSelector } from './yes-no-selector'

export function BetPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  className?: string
}) {
  const { contract, className } = props
  const user = useUser()
  const userBets = useUserContractBets(user?.id, contract.id)
  const unfilledBets = useUnfilledBets(contract.id) ?? []
  const { sharesOutcome } = useSaveBinaryShares(contract, userBets)

  const [isLimitOrder, setIsLimitOrder] = useState(false)

  return (
    <Col className={className}>
      <SellRow
        contract={contract}
        user={user}
        className={'rounded-t-md bg-gray-100 px-4 py-5'}
      />
      <Col
        className={clsx(
          'relative rounded-b-md bg-white px-6 py-6',
          !sharesOutcome && 'rounded-t-md',
          className
        )}
      >
        <QuickOrLimitBet
          isLimitOrder={isLimitOrder}
          setIsLimitOrder={setIsLimitOrder}
        />
        <BuyPanel
          hidden={isLimitOrder}
          contract={contract}
          user={user}
          unfilledBets={unfilledBets}
        />
        <LimitOrderPanel
          hidden={!isLimitOrder}
          contract={contract}
          user={user}
          unfilledBets={unfilledBets}
        />
        <SignUpPrompt />
      </Col>
      {unfilledBets.length > 0 && (
        <LimitBets className="mt-4" contract={contract} bets={unfilledBets} />
      )}
    </Col>
  )
}

export function SimpleBetPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  className?: string
  selected?: 'YES' | 'NO'
  hasShares?: boolean
  onBetSuccess?: () => void
}) {
  const { contract, className, selected, hasShares, onBetSuccess } = props

  const user = useUser()
  const [isLimitOrder, setIsLimitOrder] = useState(false)

  const unfilledBets = useUnfilledBets(contract.id) ?? []

  return (
    <Col className={className}>
      <SellRow
        contract={contract}
        user={user}
        className={'rounded-t-md bg-gray-100 px-4 py-5'}
      />
      <Col
        className={clsx(
          !hasShares && 'rounded-t-md',
          'rounded-b-md bg-white px-8 py-6'
        )}
      >
        <QuickOrLimitBet
          isLimitOrder={isLimitOrder}
          setIsLimitOrder={setIsLimitOrder}
        />
        <BuyPanel
          hidden={isLimitOrder}
          contract={contract}
          user={user}
          unfilledBets={unfilledBets}
          selected={selected}
          onBuySuccess={onBetSuccess}
        />
        <LimitOrderPanel
          hidden={!isLimitOrder}
          contract={contract}
          user={user}
          unfilledBets={unfilledBets}
          onBuySuccess={onBetSuccess}
        />
        <SignUpPrompt />
      </Col>

      {unfilledBets.length > 0 && (
        <LimitBets className="mt-4" contract={contract} bets={unfilledBets} />
      )}
    </Col>
  )
}

function BuyPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  user: User | null | undefined
  unfilledBets: Bet[]
  hidden: boolean
  selected?: 'YES' | 'NO'
  onBuySuccess?: () => void
}) {
  const { contract, user, unfilledBets, hidden, selected, onBuySuccess } = props

  const initialProb = getProbability(contract)
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(selected)
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  const [inputRef, focusAmountInput] = useFocus()

  useEffect(() => {
    if (selected) {
      if (isIOS()) window.scrollTo(0, window.scrollY + 200)
      focusAmountInput()
    }
  }, [selected, focusAmountInput])

  function onBetChoice(choice: 'YES' | 'NO') {
    setOutcome(choice)
    setWasSubmitted(false)
    focusAmountInput()
  }

  function onBetChange(newAmount: number | undefined) {
    setWasSubmitted(false)
    setBetAmount(newAmount)
    if (!outcome) {
      setOutcome('YES')
    }
  }

  async function submitBet() {
    if (!user || !betAmount) return

    setError(undefined)
    setIsSubmitting(true)

    placeBet({
      outcome,
      amount: betAmount,
      contractId: contract.id,
    })
      .then((r) => {
        console.log('placed bet. Result:', r)
        setIsSubmitting(false)
        setWasSubmitted(true)
        setBetAmount(undefined)
        if (onBuySuccess) onBuySuccess()
      })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.toString())
        } else {
          console.error(e)
          setError('Error placing bet')
        }
        setIsSubmitting(false)
      })

    track('bet', {
      location: 'bet panel',
      outcomeType: contract.outcomeType,
      slug: contract.slug,
      contractId: contract.id,
      amount: betAmount,
      outcome,
      isLimitOrder: false,
    })
  }

  const betDisabled = isSubmitting || !betAmount || error

  const { newPool, newP, newBet } = getBinaryCpmmBetInfo(
    outcome ?? 'YES',
    betAmount ?? 0,
    contract,
    undefined,
    unfilledBets as LimitBet[]
  )

  const resultProb = getCpmmProbability(newPool, newP)
  const probStayedSame =
    formatPercent(resultProb) === formatPercent(initialProb)

  const currentPayout = newBet.shares

  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = formatPercent(currentReturn)

  const totalFees = sum(Object.values(newBet.fees))

  const format = getFormattedMappedValue(contract)

  return (
    <Col className={hidden ? 'hidden' : ''}>
      <div className="my-3 text-left text-sm text-gray-500">
        {isPseudoNumeric ? 'Direction' : 'Outcome'}
      </div>
      <YesNoSelector
        className="mb-4"
        btnClassName="flex-1"
        selected={outcome}
        onSelect={(choice) => onBetChoice(choice)}
        isPseudoNumeric={isPseudoNumeric}
      />

      <div className="my-3 text-left text-sm text-gray-500">Amount</div>
      <BuyAmountInput
        inputClassName="w-full max-w-none"
        amount={betAmount}
        onChange={onBetChange}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        inputRef={inputRef}
      />
      <Col className="mt-3 w-full gap-3">
        <Row className="items-center justify-between text-sm">
          <div className="text-gray-500">
            {isPseudoNumeric ? 'Estimated value' : 'Probability'}
          </div>
          {probStayedSame ? (
            <div>{format(initialProb)}</div>
          ) : (
            <div>
              {format(initialProb)}
              <span className="mx-2">→</span>
              {format(resultProb)}
            </div>
          )}
        </Row>

        <Row className="items-center justify-between gap-2 text-sm">
          <Row className="flex-nowrap items-center gap-2 whitespace-nowrap text-gray-500">
            <div>
              {isPseudoNumeric ? (
                'Max payout'
              ) : (
                <>
                  Payout if <BinaryOutcomeLabel outcome={outcome ?? 'YES'} />
                </>
              )}
            </div>
            <InfoTooltip
              text={`Includes ${formatMoneyWithDecimals(totalFees)} in fees`}
            />
          </Row>
          <div>
            <span className="mr-2 whitespace-nowrap">
              {formatMoney(currentPayout)}
            </span>
            (+{currentReturnPercent})
          </div>
        </Row>
      </Col>

      <Spacer h={8} />

      {user && (
        <button
          className={clsx(
            'btn flex-1',
            betDisabled
              ? 'btn-disabled'
              : outcome === 'YES'
              ? 'btn-primary'
              : 'border-none bg-red-400 hover:bg-red-500',
            isSubmitting ? 'loading' : ''
          )}
          onClick={betDisabled ? undefined : submitBet}
        >
          {isSubmitting ? 'Submitting...' : 'Submit bet'}
        </button>
      )}

      {wasSubmitted && <div className="mt-4">Bet submitted!</div>}
    </Col>
  )
}

function LimitOrderPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  user: User | null | undefined
  unfilledBets: Bet[]
  hidden: boolean
  onBuySuccess?: () => void
}) {
  const { contract, user, unfilledBets, hidden, onBuySuccess } = props

  const initialProb = getProbability(contract)
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  const [lowLimitProb, setLowLimitProb] = useState<number | undefined>()
  const [highLimitProb, setHighLimitProb] = useState<number | undefined>()
  const betChoice = 'YES'
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  const rangeError =
    lowLimitProb !== undefined &&
    highLimitProb !== undefined &&
    lowLimitProb >= highLimitProb

  const outOfRangeError =
    (lowLimitProb !== undefined &&
      (lowLimitProb <= 0 || lowLimitProb >= 100)) ||
    (highLimitProb !== undefined &&
      (highLimitProb <= 0 || highLimitProb >= 100))

  const initialLow = initialProb * 0.9
  const initialHigh = initialProb + (1 - initialProb) * 0.1
  const lowPlaceholder = Math.round(
    isPseudoNumeric ? getMappedValue(contract)(initialLow) : initialLow * 100
  ).toString()
  const highPlaceholder = Math.round(
    isPseudoNumeric ? getMappedValue(contract)(initialHigh) : initialHigh * 100
  ).toString()

  const hasYesLimitBet = lowLimitProb !== undefined && !!betAmount
  const hasNoLimitBet = highLimitProb !== undefined && !!betAmount
  const hasTwoBets = hasYesLimitBet && hasNoLimitBet

  const betDisabled =
    isSubmitting ||
    !betAmount ||
    rangeError ||
    outOfRangeError ||
    error ||
    (!hasYesLimitBet && !hasNoLimitBet)

  const yesLimitProb =
    lowLimitProb === undefined ? undefined : lowLimitProb / 100
  const noLimitProb =
    highLimitProb === undefined ? undefined : highLimitProb / 100

  const shares =
    yesLimitProb !== undefined && noLimitProb !== undefined
      ? Math.min(
          (betAmount ?? 0) / yesLimitProb,
          (betAmount ?? 0) / (1 - noLimitProb)
        )
      : (betAmount ?? 0) / (yesLimitProb ?? 1 - (noLimitProb ?? 1))

  const yesAmount = shares * (yesLimitProb ?? 1)
  const noAmount = shares * (1 - (noLimitProb ?? 1))

  const profitIfBothFilled = shares - (yesAmount + noAmount)

  function onBetChange(newAmount: number | undefined) {
    setWasSubmitted(false)
    setBetAmount(newAmount)
  }

  async function submitBet() {
    if (!user || betDisabled) return

    setError(undefined)
    setIsSubmitting(true)

    const betsPromise = hasTwoBets
      ? Promise.all([
          placeBet({
            outcome: 'YES',
            amount: yesAmount,
            limitProb: yesLimitProb,
            contractId: contract.id,
          }),
          placeBet({
            outcome: 'NO',
            amount: noAmount,
            limitProb: noLimitProb,
            contractId: contract.id,
          }),
        ])
      : placeBet({
          outcome: hasYesLimitBet ? 'YES' : 'NO',
          amount: betAmount,
          contractId: contract.id,
          limitProb: hasYesLimitBet ? yesLimitProb : noLimitProb,
        })

    betsPromise
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.toString())
        } else {
          console.error(e)
          setError('Error placing bet')
        }
        setIsSubmitting(false)
      })
      .then((r) => {
        console.log('placed bet. Result:', r)
        setIsSubmitting(false)
        setWasSubmitted(true)
        setBetAmount(undefined)
        if (onBuySuccess) onBuySuccess()
      })

    if (hasYesLimitBet) {
      track('bet', {
        location: 'bet panel',
        outcomeType: contract.outcomeType,
        slug: contract.slug,
        contractId: contract.id,
        amount: yesAmount,
        outcome: 'YES',
        limitProb: yesLimitProb,
        isLimitOrder: true,
        isRangeOrder: hasTwoBets,
      })
    }
    if (hasNoLimitBet) {
      track('bet', {
        location: 'bet panel',
        outcomeType: contract.outcomeType,
        slug: contract.slug,
        contractId: contract.id,
        amount: noAmount,
        outcome: 'NO',
        limitProb: noLimitProb,
        isLimitOrder: true,
        isRangeOrder: hasTwoBets,
      })
    }
  }

  const {
    currentPayout: yesPayout,
    currentReturn: yesReturn,
    totalFees: yesFees,
    newBet: yesBet,
  } = getBinaryBetStats(
    'YES',
    yesAmount,
    contract,
    Math.min(yesLimitProb ?? initialLow, 0.999),
    unfilledBets as LimitBet[]
  )
  const yesReturnPercent = formatPercent(yesReturn)

  const {
    currentPayout: noPayout,
    currentReturn: noReturn,
    totalFees: noFees,
    newBet: noBet,
  } = getBinaryBetStats(
    'NO',
    noAmount,
    contract,
    Math.max(noLimitProb ?? initialHigh, 0.01),
    unfilledBets as LimitBet[]
  )
  const noReturnPercent = formatPercent(noReturn)

  return (
    <Col className={hidden ? 'hidden' : ''}>
      <div className="my-3 text-sm text-gray-500">
        Bet when the {isPseudoNumeric ? 'value' : 'probability'} reaches Low
        and/or High limit.
      </div>

      <Row className="items-center gap-4">
        <Col className="gap-2">
          <div className="ml-1 text-sm text-gray-500">Low</div>
          <ProbabilityOrNumericInput
            contract={contract}
            prob={lowLimitProb}
            setProb={setLowLimitProb}
            isSubmitting={isSubmitting}
            placeholder={lowPlaceholder}
          />
        </Col>
        <Col className="gap-2">
          <div className="ml-1 text-sm text-gray-500">High</div>
          <ProbabilityOrNumericInput
            contract={contract}
            prob={highLimitProb}
            setProb={setHighLimitProb}
            isSubmitting={isSubmitting}
            placeholder={highPlaceholder}
          />
        </Col>
      </Row>

      {rangeError && (
        <div className="mb-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide text-red-500">
          Low limit must be less than High limit
        </div>
      )}
      {outOfRangeError && (
        <div className="mb-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide text-red-500">
          Limit is out of range
        </div>
      )}

      <div className="my-3 text-left text-sm text-gray-500">
        Max amount<span className="ml-1 text-red-500">*</span>
      </div>
      <BuyAmountInput
        inputClassName="w-full max-w-none"
        amount={betAmount}
        onChange={onBetChange}
        error={error}
        setError={setError}
        disabled={isSubmitting}
      />

      <Col className="mt-3 w-full gap-3">
        {(hasTwoBets || (hasYesLimitBet && yesBet.amount !== 0)) && (
          <Row className="items-center justify-between gap-2 text-sm">
            <div className="whitespace-nowrap text-gray-500">
              {isPseudoNumeric ? (
                <HigherLabel />
              ) : (
                <BinaryOutcomeLabel outcome={'YES'} />
              )}{' '}
              current fill
            </div>
            <div className="mr-2 whitespace-nowrap">
              {formatMoney(yesBet.amount)} of{' '}
              {formatMoney(yesBet.orderAmount ?? 0)}
            </div>
          </Row>
        )}
        {(hasTwoBets || (hasNoLimitBet && noBet.amount !== 0)) && (
          <Row className="items-center justify-between gap-2 text-sm">
            <div className="whitespace-nowrap text-gray-500">
              {isPseudoNumeric ? (
                <LowerLabel />
              ) : (
                <BinaryOutcomeLabel outcome={'NO'} />
              )}{' '}
              current fill
            </div>
            <div className="mr-2 whitespace-nowrap">
              {formatMoney(noBet.amount)} of{' '}
              {formatMoney(noBet.orderAmount ?? 0)}
            </div>
          </Row>
        )}
        {hasTwoBets && (
          <Row className="items-center justify-between gap-2 text-sm">
            <div className="whitespace-nowrap text-gray-500">
              Profit if both orders filled
            </div>
            <div className="mr-2 whitespace-nowrap">
              {formatMoney(profitIfBothFilled)}
            </div>
          </Row>
        )}
        {hasYesLimitBet && !hasTwoBets && (
          <Row className="items-center justify-between gap-2 text-sm">
            <Row className="flex-nowrap items-center gap-2 whitespace-nowrap text-gray-500">
              <div>
                {isPseudoNumeric ? (
                  'Max payout'
                ) : (
                  <>
                    Max <BinaryOutcomeLabel outcome={'YES'} /> payout
                  </>
                )}
              </div>
              <InfoTooltip
                text={`Includes ${formatMoneyWithDecimals(yesFees)} in fees`}
              />
            </Row>
            <div>
              <span className="mr-2 whitespace-nowrap">
                {formatMoney(yesPayout)}
              </span>
              (+{yesReturnPercent})
            </div>
          </Row>
        )}
        {hasNoLimitBet && !hasTwoBets && (
          <Row className="items-center justify-between gap-2 text-sm">
            <Row className="flex-nowrap items-center gap-2 whitespace-nowrap text-gray-500">
              <div>
                {isPseudoNumeric ? (
                  'Max payout'
                ) : (
                  <>
                    Max <BinaryOutcomeLabel outcome={'NO'} /> payout
                  </>
                )}
              </div>
              <InfoTooltip
                text={`Includes ${formatMoneyWithDecimals(noFees)} in fees`}
              />
            </Row>
            <div>
              <span className="mr-2 whitespace-nowrap">
                {formatMoney(noPayout)}
              </span>
              (+{noReturnPercent})
            </div>
          </Row>
        )}
      </Col>

      {(hasYesLimitBet || hasNoLimitBet) && <Spacer h={8} />}

      {user && (
        <button
          className={clsx(
            'btn flex-1',
            betDisabled
              ? 'btn-disabled'
              : betChoice === 'YES'
              ? 'btn-primary'
              : 'border-none bg-red-400 hover:bg-red-500',
            isSubmitting ? 'loading' : ''
          )}
          onClick={betDisabled ? undefined : submitBet}
        >
          {isSubmitting
            ? 'Submitting...'
            : `Submit order${hasTwoBets ? 's' : ''}`}
        </button>
      )}

      {wasSubmitted && <div className="mt-4">Order submitted!</div>}
    </Col>
  )
}

function QuickOrLimitBet(props: {
  isLimitOrder: boolean
  setIsLimitOrder: (isLimitOrder: boolean) => void
}) {
  const { isLimitOrder, setIsLimitOrder } = props

  return (
    <Row className="align-center mb-4 justify-between">
      <div className="text-4xl">Bet</div>
      <Row className="mt-1 items-center gap-2">
        <PillButton
          selected={!isLimitOrder}
          onSelect={() => {
            setIsLimitOrder(false)
            track('select quick order')
          }}
        >
          Quick
        </PillButton>
        <PillButton
          selected={isLimitOrder}
          onSelect={() => {
            setIsLimitOrder(true)
            track('select limit order')
          }}
        >
          Limit
        </PillButton>
      </Row>
    </Row>
  )
}

export function SellPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  userBets: Bet[]
  shares: number
  sharesOutcome: 'YES' | 'NO'
  user: User
  onSellSuccess?: () => void
}) {
  const { contract, shares, sharesOutcome, userBets, user, onSellSuccess } =
    props

  const [amount, setAmount] = useState<number | undefined>(shares)
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  const unfilledBets = useUnfilledBets(contract.id) ?? []

  const betDisabled = isSubmitting || !amount || error

  // Sell all shares if remaining shares would be < 1
  const sellQuantity = amount === Math.floor(shares) ? shares : amount

  async function submitSell() {
    if (!user || !amount) return

    setError(undefined)
    setIsSubmitting(true)

    await sellShares({
      shares: sellQuantity,
      outcome: sharesOutcome,
      contractId: contract.id,
    })
      .then((r) => {
        console.log('Sold shares. Result:', r)
        setIsSubmitting(false)
        setWasSubmitted(true)
        setAmount(undefined)
        if (onSellSuccess) onSellSuccess()
      })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.toString())
        } else {
          console.error(e)
          setError('Error selling')
        }
        setIsSubmitting(false)
      })

    track('sell shares', {
      outcomeType: contract.outcomeType,
      slug: contract.slug,
      contractId: contract.id,
      shares: sellQuantity,
      outcome: sharesOutcome,
    })
  }

  const initialProb = getProbability(contract)
  const { cpmmState, saleValue } = calculateCpmmSale(
    contract,
    sellQuantity ?? 0,
    sharesOutcome,
    unfilledBets
  )
  const resultProb = getCpmmProbability(cpmmState.pool, cpmmState.p)

  const openUserBets = userBets.filter((bet) => !bet.isSold && !bet.sale)
  const [yesBets, noBets] = partition(
    openUserBets,
    (bet) => bet.outcome === 'YES'
  )
  const [yesShares, noShares] = [
    sumBy(yesBets, (bet) => bet.shares),
    sumBy(noBets, (bet) => bet.shares),
  ]

  const ownedShares = Math.round(yesShares) || Math.round(noShares)

  const onAmountChange = (amount: number | undefined) => {
    setAmount(amount)

    // Check for errors.
    if (amount !== undefined) {
      if (amount > ownedShares) {
        setError(`Maximum ${formatWithCommas(Math.floor(ownedShares))} shares`)
      } else {
        setError(undefined)
      }
    }
  }

  const { outcomeType } = contract
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const format = getFormattedMappedValue(contract)

  return (
    <>
      <AmountInput
        amount={
          amount
            ? Math.round(amount) === 0
              ? 0
              : Math.floor(amount)
            : undefined
        }
        onChange={onAmountChange}
        label="Qty"
        error={error}
        disabled={isSubmitting}
        inputClassName="w-full"
      />

      <Col className="mt-3 w-full gap-3 text-sm">
        <Row className="items-center justify-between gap-2 text-gray-500">
          Sale proceeds
          <span className="text-neutral">{formatMoney(saleValue)}</span>
        </Row>
        <Row className="items-center justify-between">
          <div className="text-gray-500">
            {isPseudoNumeric ? 'Estimated value' : 'Probability'}
          </div>
          <div>
            {format(initialProb)}
            <span className="mx-2">→</span>
            {format(resultProb)}
          </div>
        </Row>
      </Col>

      <Spacer h={8} />

      <button
        className={clsx(
          'btn flex-1',
          betDisabled
            ? 'btn-disabled'
            : sharesOutcome === 'YES'
            ? 'btn-primary'
            : 'border-none bg-red-400 hover:bg-red-500',
          isSubmitting ? 'loading' : ''
        )}
        onClick={betDisabled ? undefined : submitSell}
      >
        {isSubmitting ? 'Submitting...' : 'Submit sell'}
      </button>

      {wasSubmitted && <div className="mt-4">Sell submitted!</div>}
    </>
  )
}
