import Link from 'next/link';
import Icon from '@/components/Icon';

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[80svh] max-w-3xl flex-col justify-center px-6 py-32 sm:px-10">
      <p className="font-bengali text-2xl text-moss-600">প্রশান্তি</p>
      <h1 className="display-lg mt-8 font-light">
        Nothing here but mist.
      </h1>
      <p className="lede mt-6">
        The page you were looking for is not on this hill. Try the retreats, or
        write to us and we will point you somewhere.
      </p>
      <div className="mt-12 flex flex-wrap gap-4">
        <Link href="/" className="btn-primary">
          Back to the house
        </Link>
        <Link href="/retreats" className="btn-ghost group">
          See the retreats
          <Icon
            name="arrow"
            className="h-4 w-4 transition-transform duration-500 ease-calm group-hover:translate-x-1"
          />
        </Link>
      </div>
    </section>
  );
}
