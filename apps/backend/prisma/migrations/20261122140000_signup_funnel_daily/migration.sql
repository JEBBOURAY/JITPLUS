-- Sign-up funnel of the JitPlus client app: daily counters, no personal data.
CREATE TABLE "signup_funnel_daily" (
    "day" DATE NOT NULL,
    "step" VARCHAR(32) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "platform" VARCHAR(10) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "signup_funnel_daily_pkey" PRIMARY KEY ("day","step","method","platform")
);
