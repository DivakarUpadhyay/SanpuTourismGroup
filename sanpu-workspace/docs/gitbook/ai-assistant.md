# AI Travel assistant

## Traveler workflow
1. Describe the trip (home page box or `/assistant`).
2. The assistant calls tools against Sanpu Travel's live API: list destinations, search tours, tour details, compare tours, search hotels/flights/buses/taxis, prepare booking, my bookings, my trip plans.
3. Reply + cards (tours, options, comparison, booking).
4. **Book this** on a card, or ask the assistant → booking prepared at the live price, held 30 minutes.
5. The traveler pays a deposit or in full (the model never pays) → email → **My bookings**.

## AI providers
Order from setting `Assistant.ProviderOrder` (default `Gemini,OpenAI,Anthropic`); the next one answers when one is unavailable. Keys (user-secrets of the AI Travel API): `GEMINI_API_KEY` (free at aistudio.google.com/apikey), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. With no working AI, the assistant still answers with direct live search and **Book this** works.

## Safety
Live data only (no invented prices), the traveler confirms every payment, monthly AI budget (`Ai.MonthlyBudgetUsd`), every call logged, staff approve disruption recovery plans.
