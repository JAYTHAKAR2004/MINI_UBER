import time

MAX_ATTEMPTS = 3
INITIAL_BACKOFF = 1

attempts = 0
delays = []

def simulate_processing():
    global attempts
    attempts += 1
    raise ValueError("Simulated processing failure")

for attempt in range(1, MAX_ATTEMPTS + 1):
    try:
        simulate_processing()
        break
    except Exception as exc:
        print(f"Processing failed: attempt {attempt}/{MAX_ATTEMPTS}: {exc}")

        if attempt < MAX_ATTEMPTS:
            delay = INITIAL_BACKOFF * (2 ** (attempt - 1))
            delays.append(delay)
            print(f"Retrying in {delay} seconds...")
            time.sleep(delay)

print("\n========== TEST RESULT ==========")
print(f"Total attempts: {attempts}")
print(f"Backoff delays: {delays}")
print(f"Expected attempts: 3")
print(f"Expected delays: [1, 2]")
print("Retry mechanism:", "PASSED" if attempts == 3 and delays == [1, 2] else "FAILED")
