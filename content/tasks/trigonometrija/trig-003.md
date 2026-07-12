---
id: trig-003
slot: 5
topic: trigonometrija
difficulty: 3
source: 'Do indeksa (autorski)'
origin: 'FTN_P1_Tematski_Zadaci_sr.tex, slot 5, zadatak 5'
status: review
answer: 'a) $x\in\left\{-\frac{\pi}{2},\ 0,\ \frac{\pi}{2}\right\}$; b) $x\in\left(-\frac{\pi}{2},0\right)\cup\left(0,\frac{\pi}{2}\right)$; c) $x\in\left(-\pi,-\frac{\pi}{2}\right)\cup\left(\frac{\pi}{2},\pi\right]$'
---

## Zadatak

Data je funkcija $f(x)=2\cos x-\cos 2x-1$, posmatrana na intervalu $(-\pi,\,\pi]$.

**a)** Naći sve nule funkcije $f$ na $(-\pi,\,\pi]$.

**b)** Rešiti nejednačinu $f(x)>0$ na $(-\pi,\,\pi]$.

**c)** Rešiti nejednačinu $f(x)<0$ na $(-\pi,\,\pi]$.

## Rešenje

Koristeći $\cos 2x=2\cos^2 x-1$, rastavimo funkciju na činioce:

$$f(x)=2\cos x-(2\cos^2 x-1)-1=2\cos x\,(1-\cos x).$$

**a)** $f(x)=0\iff\cos x=0$ ili $\cos x=1$. Na $(-\pi,\pi]$ iz $\cos x=0$ dobijamo $x=\pm\dfrac{\pi}{2}$, iz $\cos x=1$ dobijamo $x=0$. Nule: $-\dfrac{\pi}{2},\ 0,\ \dfrac{\pi}{2}$.

Činilac $1-\cos x\ge 0$ svuda i jednak je nuli samo za $x=0$, pa se za $x\ne 0$ znak $f$ poklapa sa znakom $\cos x$.

**b)** $f(x)>0\iff\cos x>0$ i $x\ne 0$. Na $(-\pi,\pi]$ to je $x\in\left(-\dfrac{\pi}{2},0\right)\cup\left(0,\dfrac{\pi}{2}\right)$.

**c)** $f(x)<0\iff\cos x<0$, to jest $x\in\left(-\pi,-\dfrac{\pi}{2}\right)\cup\left(\dfrac{\pi}{2},\pi\right]$ (u tački $x=\pi$ imamo $f(\pi)=-4<0$).
