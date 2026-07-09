---
name: create-unit-tests
description: Creating unit tests
---

# unit-tests

Unit tests can be polluted very easily, because they are often implemented for passing, not checking functionality. This means a strict way of writing them is required:  
  
1. For the given units, compile a list of empty API shells (in -> out, without any implementation details).  
2. Create a Grok 4.5 High subagent. This will be the test writer.  
3. Provide the API shells and instruct the agent to write tests for them. Tell the agent it is not allowed to inspect the actual code under any circumstance.  
4. After the subagent completes, inspect the tests and verify no cheating has occured.