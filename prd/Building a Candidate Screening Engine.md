Since we are strictly limited to the fields in these CSVs (Name, Email, College, Branch, CGPA, Best AI Project, Research Work, GitHub Profile, Resume Link, `test_la`, and `test_code`), we need to build a deterministic engine that extracts maximum signal from minimal data types: raw text, raw numbers, and external metadata (via the GitHub link). 

Here are the specific mathematical and statistical frameworks you can adapt to build a highly defensible screening and ranking engine using only this data.

### 1. Vector Space Model (For Text-Based Fields)
**Applies to:** *Resume Link (parsed text), Best AI Project, Research Work.*

You cannot perform basic keyword matching on an AI project description or a research paper abstract. Instead, you should map these textual fields into a semantic vector space to compare them against the provided Job Description (JD).

* **The Framework: Cosine Similarity on Dense Embeddings**
    Pass the text from the candidate's "Best AI Project" and "Research Work" through an embedding model to create dense numerical vectors. Do the same for the JD. Calculate the cosine similarity to get a bounded score between 0 and 1.
    $$\text{Similarity} = \frac{\vec{A} \cdot \vec{B}}{\|\vec{A}\| \|\vec{B}\|}$$
    *Where $\vec{A}$ is the vector representation of the candidate's text (e.g., Research Work) and $\vec{B}$ is the vector representation of the Job Description.*

### 2. Statistical Standardization (For Numeric Test Fields)
**Applies to:** *`test_la`, `test_code`, CGPA.*

A common mistake in building ranking engines is adding raw scores together. If `test_la` is out of 50, `test_code` is out of 100, and CGPA is out of 10.0, the coding test will mathematically dominate the final rank simply because it has a larger scale.

* **The Framework: Z-Score Normalization (Standard Score)**
    Instead of using raw scores, evaluate candidates dynamically against the *current applicant pool* by calculating how many standard deviations they are from the mean.
    $$Z = \frac{X - \mu}{\sigma}$$
    *Where $X$ is the candidate's raw score, $\mu$ is the mean score of all candidates in the CSV, and $\sigma$ is the standard deviation.* Convert this $Z$-score into a probability/percentile score between 0 and 1 using the Cumulative Distribution Function (CDF) of the normal distribution. This perfectly standardizes CGPA, Logic, and Coding scores so they can be compared apples-to-apples.

### 3. Kinematics / Decay Functions (For GitHub Profile)
**Applies to:** *GitHub Profile (Repository metadata).*

The assignment requires "repository-level evaluation." A candidate might have a repository with 500 stars, but if it hasn't been updated in 4 years, it shouldn't carry the same weight as an active project. 

* **The Framework: Exponential Decay (Time-Weighted Impact)**
    Pull the top repositories for a candidate via the GitHub API. Assign a base value to each repo based on stars, forks, and language relevance, but apply a decay function based on the time since the last commit.
    $$I_{repo} = (S + w \cdot F) \cdot e^{-\lambda t}$$
    *Where $I$ is the impact score of the repository, $S$ is the number of stars, $F$ is forks, $w$ is a weight multiplier for forks, $t$ is the time in days since the last commit, and $\lambda$ is the decay constant.* Sum the impact scores of their top repositories to get their final GitHub score.

### 4. Multi-Attribute Utility Theory (The Final Ranking)
Once you have generated standardized scores (0 to 1) for the semantic text, the standardized test results, and the time-decayed GitHub impact, you need a final engine to rank the CSV rows.

* **The Framework: Weighted Sum Model**
    Define a customizable weight matrix that the recruiter can adjust (e.g., weighting `test_code` higher than `test_la` for a purely technical role).
    $$U = \sum_{i=1}^{n} w_i x_i$$
    *Where $U$ is the final utility score of the candidate, $w_i$ is the weight of criterion $i$ (e.g., $0.4$ for Code, $0.2$ for GitHub, $0.2$ for Logic, $0.2$ for Projects), and $x_i$ is the candidate's normalized score for that criterion.*

**Engineering Implementation Tip:** Because you are required to support dynamically uploading CSV datasets, calculate the $\mu$ and $\sigma$ for the Z-scores *dynamically* at runtime whenever a new CSV is uploaded. This ensures your ranking engine instantly recalibrates itself based on the quality of the specific cohort of applicants.