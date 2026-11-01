
const canvas = document.getElementById("particleCanvas");

if (canvas) {
  const ctx = canvas.getContext("2d");

  let width = 0;
  let height = 0;
  let particles = [];
  let animationFrame = null;

  const PARTICLE_COUNT = 85;
  const LINK_DISTANCE = 135;

  const colors = [
    [59, 130, 246],   // Electric blue
    [6, 182, 212],    // Cyan
    [99, 102, 241],   // Indigo
    [16, 185, 129]    // Emerald
  ];

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  function createParticle(randomY = true) {
    return {
      x: Math.random() * width,
      y: randomY ? Math.random() * height : height + 5,
      vx: (Math.random() - 0.5) * 0.55,
      vy: (Math.random() - 0.5) * 0.45,
      radius: Math.random() * 1.8 + 0.8,
      color: colors[Math.floor(Math.random() * colors.length)]
    };
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    particles = Array.from(
      { length: PARTICLE_COUNT },
      () => createParticle()
    );
  }

  function drawParticles() {
    ctx.clearRect(0, 0, width, height);

    // Move and draw the particles
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);

      ctx.fillStyle = `rgba(${p.color.join(",")}, 0.85)`;
      ctx.shadowColor = `rgb(${p.color.join(",")})`;
      ctx.shadowBlur = 12;
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    // Connect nearby particles with neon lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.hypot(dx, dy);

        if (distance < LINK_DISTANCE) {
          const opacity =
            (1 - distance / LINK_DISTANCE) * 0.28;

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);

          ctx.strokeStyle =
            `rgba(79, 140, 255, ${opacity})`;

          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    animationFrame = requestAnimationFrame(drawParticles);
  }

  function startAnimation() {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;

    ctx.clearRect(0, 0, width, height);

    if (!reduceMotion.matches) {
      drawParticles();
    }
  }

  window.addEventListener("resize", resizeCanvas);

  reduceMotion.addEventListener("change", startAnimation);

  resizeCanvas();
  startAnimation();
}
